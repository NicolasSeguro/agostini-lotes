import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import { calcularVenta, CondicionesVenta } from "@/lib/venta-calc";
import { registrarHistorial } from "@/lib/workflow-helpers";

type Titular = { persona_id: string; porcentaje: number };

type Body = {
  tenant: string;
  lote_id?: string;
  convenio_id?: string | null;  // NUEVO
  titulares: Titular[];
  precio_lista: number;
  desc_financiero: number;
  anticipo: number;
  cant_cuotas: number;
  sistema_amort: "FRANCES" | "AJUSTABLE";
  tasa_interes_mensual: number;
  indice_ajuste?: string;
  fecha_primer_vto: string;
  fecha_boleto?: string | null;
  observaciones?: string | null;
};

function mapSistemaAmort(s: "FRANCES" | "AJUSTABLE"): string {
  return s === "AJUSTABLE" ? "FIJO_SIN_INTERES" : "FRANCES";
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.VENTAS);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });

  const sumaPct = body.titulares.reduce((s, t) => s + (t.porcentaje || 0), 0);
  if (Math.abs(sumaPct - 100) > 0.01) {
    return NextResponse.json({ error: `Porcentajes deben sumar 100% (actual: ${sumaPct.toFixed(2)}%)` }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ventaRes = await client.query(
      `SELECT id, estado::text, lote_id, convenio_id FROM ${schema}.ventas WHERE id = $1::uuid FOR UPDATE`,
      [id]
    );
    if (ventaRes.rows.length === 0) throw new Error("Venta no encontrada");
    if (ventaRes.rows[0].estado !== "EN_CARGA") {
      throw new Error(`Solo se edita en EN_CARGA. Estado actual: ${ventaRes.rows[0].estado}`);
    }

    const loteActualId = ventaRes.rows[0].lote_id;
    const convenioActualId = ventaRes.rows[0].convenio_id;
    let nuevoLoteId = loteActualId;

    // Cambio de lote
    if (body.lote_id && body.lote_id !== loteActualId) {
      const nuevoLoteRes = await client.query(
        `SELECT id, estado::text FROM ${schema}.lotes WHERE id = $1::uuid FOR UPDATE`,
        [body.lote_id]
      );
      if (nuevoLoteRes.rows.length === 0) throw new Error("Lote nuevo no encontrado");
      if (nuevoLoteRes.rows[0].estado !== "DISPONIBLE") {
        throw new Error(`El nuevo lote no está DISPONIBLE (estado: ${nuevoLoteRes.rows[0].estado})`);
      }
      await client.query(
        `UPDATE ${schema}.lotes SET estado = 'DISPONIBLE'::tenant_template.lote_estado
         WHERE id = $1::uuid AND estado = 'RESERVADO'::tenant_template.lote_estado`,
        [loteActualId]
      );
      await client.query(
        `UPDATE ${schema}.lotes SET estado = 'RESERVADO'::tenant_template.lote_estado WHERE id = $1::uuid`,
        [body.lote_id]
      );
      await client.query(
        `UPDATE ${schema}.ventas SET lote_id = $1::uuid WHERE id = $2::uuid`,
        [body.lote_id, id]
      );
      await registrarHistorial(
        client, schema, id, "EN_CARGA", "EN_CARGA",
        `Cambio de lote durante edición`, sessionLabel(session),
        { lote_anterior: loteActualId, lote_nuevo: body.lote_id }
      );
      nuevoLoteId = body.lote_id;
    }

    // Parámetros del tenant
    const tenantRes = await client.query(
      `SELECT COALESCE((config->>'porc_gravado')::numeric, 0) AS porc_gravado FROM shared.tenants WHERE slug = $1`,
      [body.tenant]
    );
    const porcGravado = parseFloat(tenantRes.rows[0]?.porc_gravado || 0);
    
    const loteRes = await client.query(
      `SELECT proyecto_id FROM ${schema}.lotes WHERE id = $1::uuid`, [nuevoLoteId]
    );
    const proyectoId = loteRes.rows[0].proyecto_id;
    const proyectoRes = await client.query(
      `SELECT COALESCE((config->>'tope_desc_financiero_pct')::numeric, 0.10) AS tope FROM ${schema}.proyectos WHERE id = $1`,
      [proyectoId]
    );
    const topeDescPct = parseFloat(proyectoRes.rows[0]?.tope || 0.10);

    // â”€â”€â”€â”€â”€ CONVENIO â”€â”€â”€â”€â”€
    let convenioData: any = null;
    if (body.convenio_id) {
      const cRes = await client.query(
        `SELECT id, razon_social, tipo_beneficio::text AS tipo_beneficio, valor_beneficio,
                fecha_inicio, fecha_fin, activo, tenants_aplicables
         FROM shared.convenios WHERE id = $1::uuid`,
        [body.convenio_id]
      );
      if (cRes.rows.length === 0) throw new Error("Convenio no encontrado");
      const c = cRes.rows[0];
      
      // Validar vigencia + aplicabilidad al tenant
      if (!c.activo) throw new Error("El convenio está dado de baja");
      const hoy = new Date().toISOString().slice(0, 10);
      const fi = new Date(c.fecha_inicio).toISOString().slice(0, 10);
      const ff = new Date(c.fecha_fin).toISOString().slice(0, 10);
      if (hoy < fi || hoy > ff) {
        throw new Error(`El convenio no está vigente (${fi} a ${ff})`);
      }
      const aplicables: string[] = c.tenants_aplicables || [];
      if (!aplicables.includes(body.tenant)) {
        throw new Error(`El convenio no aplica al tenant ${body.tenant}`);
      }
      
      convenioData = {
        id: c.id,
        razon_social: c.razon_social,
        tipo_beneficio: c.tipo_beneficio,
        valor_beneficio: parseFloat(c.valor_beneficio),
      };
    }

    // Calcular
    const cond: CondicionesVenta = {
      precio_lista: body.precio_lista,
      desc_financiero: body.desc_financiero || 0,
      desc_comercial: 0,
      anticipo: body.anticipo || 0,
      cant_cuotas: body.cant_cuotas,
      sistema_amort: body.sistema_amort,
      tasa_interes_mensual: body.tasa_interes_mensual || 0,
      fecha_primer_vto: body.fecha_primer_vto,
      convenio: convenioData ? {
        tipo_beneficio: convenioData.tipo_beneficio,
        valor_beneficio: convenioData.valor_beneficio,
      } : null,
    };
    const calc = calcularVenta(cond, porcGravado, topeDescPct);

    if (calc.error_convenio_excede_lista) {
      throw new Error("El descuento del convenio excede el precio lista");
    }
    if (calc.monto_a_financiar < 0) throw new Error("El anticipo no puede superar el precio boleto");
    if (calc.precio_boleto <= 0) throw new Error("El precio boleto debe ser mayor a 0");

    // Tasa punitoria del tenant
    const tasaPunRes = await client.query(
      `SELECT COALESCE((config->>'tasa_punitoria_diaria')::numeric, 0.004) AS tasa FROM shared.tenants WHERE slug = $1`,
      [body.tenant]
    );
    const tasaPunDiaria = parseFloat(tasaPunRes.rows[0]?.tasa || 0.004);

    // Actualizar venta con convenio congelado
    await client.query(
      `UPDATE ${schema}.ventas SET
        precio_lista = $2, precio_total = $3, anticipo = $4,
        descuento_financiero = $5, cant_cuotas = $6,
        sistema_amort = $7::shared.sistema_amort, tasa_interes_mensual = $8,
        indice_ajuste = $25::shared.indice_tipo,
        tasa_punitorio_mensual = $9, dia_vto = $10, fecha_primer_vto = $11::date,
        cuota_base = $12, alicuota_iva = $13,
        capital_total_gr = $14, capital_total_ex = $15, iva_capital_total = $16,
        fecha_boleto = $17::date, requiere_aut_desc_fin = $18,
        observaciones = $19,
        convenio_id = $20, convenio_razon_social = $21,
        convenio_tipo_beneficio = $22, convenio_valor_beneficio = $23,
        descuento_convenio = $24,
        updated_at = NOW()
      WHERE id = $1::uuid`,
      [
        id, body.precio_lista, calc.precio_boleto, body.anticipo || 0,
        body.desc_financiero || 0, body.cant_cuotas, mapSistemaAmort(body.sistema_amort),
        body.tasa_interes_mensual || 0, tasaPunDiaria * 30,
        parseInt(body.fecha_primer_vto.split('-')[2]), body.fecha_primer_vto,
        calc.cuota_base, porcGravado * 21,
        calc.capital_gr_total, calc.capital_ex_total, calc.iva_capital_total,
        body.fecha_boleto || null, calc.excede_tope_desc, body.observaciones || null,
        convenioData?.id || null,
        convenioData?.razon_social || null,
        convenioData?.tipo_beneficio || null,
        convenioData?.valor_beneficio || null,
        calc.descuento_convenio,
        body.indice_ajuste || "NINGUNO",
      ]
    );

    // Registrar cambio de convenio si aplica
    if (convenioActualId !== (convenioData?.id || null)) {
      await registrarHistorial(
        client, schema, id, "EN_CARGA", "EN_CARGA",
        convenioData
          ? `Convenio aplicado: ${convenioData.razon_social} (${convenioData.tipo_beneficio === "PORCENTAJE" ? convenioData.valor_beneficio + "%" : "$" + convenioData.valor_beneficio})`
          : "Convenio retirado de la venta", sessionLabel(session),
        { convenio_anterior: convenioActualId, convenio_nuevo: convenioData?.id || null }
      );
    }

    // Titulares
    await client.query(`DELETE FROM ${schema}.venta_titulares WHERE venta_id = $1::uuid`, [id]);
    let orden = 1;
    for (const t of body.titulares) {
      await client.query(
        `INSERT INTO ${schema}.venta_titulares (venta_id, persona_id, porcentaje, solidario, orden, fecha_alta)
         VALUES ($1::uuid, $2::uuid, $3, true, $4, CURRENT_DATE)`,
        [id, t.persona_id, t.porcentaje, orden++]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
