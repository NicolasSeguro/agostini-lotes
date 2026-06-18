import { NextRequest, NextResponse } from "next/server";
import { getSchema, getPool } from "@/lib/db";
import { calcularVenta, CondicionesVenta } from "@/lib/venta-calc";

type Titular = {
  persona_id: string;
  porcentaje: number;
  solidario?: boolean;
};

type Body = {
  tenant: string;
  lote_id: string;
  convenio_id?: string | null;  // NUEVO
  vendedor_persona_id?: string | null;
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
  tasa_punitorio_diaria: number;
  observaciones?: string | null;
};

function mapSistemaAmort(s: "FRANCES" | "AJUSTABLE"): string {
  return s === "AJUSTABLE" ? "FIJO_SIN_INTERES" : "FRANCES";
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!body.lote_id) return NextResponse.json({ error: "Lote requerido" }, { status: 400 });
  if (!body.titulares?.length) return NextResponse.json({ error: "Al menos 1 titular" }, { status: 400 });
  
  const sumaPct = body.titulares.reduce((s, t) => s + (t.porcentaje || 0), 0);
  if (Math.abs(sumaPct - 100) > 0.01) {
    return NextResponse.json({ error: `Porcentajes deben sumar 100% (actual: ${sumaPct.toFixed(2)}%)` }, { status: 400 });
  }
  
  if (!body.precio_lista || body.precio_lista <= 0) {
    return NextResponse.json({ error: "Precio lista debe ser mayor a 0" }, { status: 400 });
  }
  if (!body.cant_cuotas || body.cant_cuotas <= 0) {
    return NextResponse.json({ error: "Cantidad de cuotas debe ser mayor a 0" }, { status: 400 });
  }
  if (!body.fecha_primer_vto) {
    return NextResponse.json({ error: "Fecha primer vencimiento requerida" }, { status: 400 });
  }
  
  const personaIds = new Set(body.titulares.map(t => t.persona_id));
  if (personaIds.size !== body.titulares.length) {
    return NextResponse.json({ error: "Hay titulares duplicados" }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const loteRes = await client.query(
      `SELECT id, proyecto_id, estado::text, precio_lista FROM ${schema}.lotes
       WHERE id = $1::uuid FOR UPDATE`,
      [body.lote_id]
    );
    if (loteRes.rows.length === 0) throw new Error("Lote no encontrado");
    if (loteRes.rows[0].estado !== "DISPONIBLE") {
      throw new Error(`El lote no estÃ¡ disponible (estado actual: ${loteRes.rows[0].estado})`);
    }
    const proyectoId = loteRes.rows[0].proyecto_id;

    const tenantRes = await client.query(
      `SELECT COALESCE((config->>'porc_gravado')::numeric, 0) AS porc_gravado FROM shared.tenants WHERE slug = $1`,
      [body.tenant]
    );
    const porcGravado = parseFloat(tenantRes.rows[0]?.porc_gravado || 0);
    
    const proyectoRes = await client.query(
      `SELECT COALESCE((config->>'tope_desc_financiero_pct')::numeric, 0.10) AS tope FROM ${schema}.proyectos WHERE id = $1`,
      [proyectoId]
    );
    const topeDescPct = parseFloat(proyectoRes.rows[0]?.tope || 0.10);

    // â”€â”€â”€â”€â”€ Convenio (si viene) â”€â”€â”€â”€â”€
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
      if (!c.activo) throw new Error("El convenio estÃ¡ dado de baja");
      const hoy = new Date().toISOString().slice(0, 10);
      const fi = new Date(c.fecha_inicio).toISOString().slice(0, 10);
      const ff = new Date(c.fecha_fin).toISOString().slice(0, 10);
      if (hoy < fi || hoy > ff) {
        throw new Error(`El convenio no estÃ¡ vigente (${fi} a ${ff})`);
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

    const personaCheck = await client.query(
      `SELECT id FROM ${schema}.personas WHERE id = ANY($1::uuid[])`,
      [body.titulares.map(t => t.persona_id)]
    );
    if (personaCheck.rows.length !== body.titulares.length) {
      throw new Error("Alguna persona titular no existe");
    }

    const ventaRes = await client.query(
      `
      INSERT INTO ${schema}.ventas
        (lote_id, vendedor_id, fecha, estado, precio_lista,
         precio_total, moneda, anticipo, descuento_comercial, descuento_financiero,
         cant_cuotas, sistema_amort, indice_ajuste, tasa_interes_mensual,
         tasa_punitorio_mensual, dia_vto, fecha_primer_vto, cuota_base,
         alicuota_iva, porc_iva_intereses,
         capital_total_gr, capital_total_ex, iva_capital_total,
         fecha_boleto, requiere_aut_desc_fin, observaciones, metadata,
         convenio_id, convenio_razon_social, convenio_tipo_beneficio, 
         convenio_valor_beneficio, descuento_convenio)
      VALUES
        ($1::uuid, $2::uuid, CURRENT_DATE, 'EN_CARGA'::tenant_template.venta_estado,
         $3, $4, 'ARS', $5, 0, $6,
         $7, $8::shared.sistema_amort, $26::shared.indice_tipo, $9,
         $10, $11, $12::date, $13,
         $14, $14,
         $15, $16, $17,
         $18::date, $19, $20, '{}'::jsonb,
         $21, $22, $23, $24, $25)
      RETURNING id, nro
      `,
      [
        body.lote_id,
        body.vendedor_persona_id || null,
        body.precio_lista,
        calc.precio_boleto,
        body.anticipo || 0,
        body.desc_financiero || 0,
        body.cant_cuotas,
        mapSistemaAmort(body.sistema_amort),
        body.tasa_interes_mensual || 0,
        (body.tasa_punitorio_diaria || 0.4) * 30,
        parseInt(body.fecha_primer_vto.split('-')[2]),
        body.fecha_primer_vto,
        calc.cuota_base,
        porcGravado * 21,
        calc.capital_gr_total,
        calc.capital_ex_total,
        calc.iva_capital_total,
        body.fecha_boleto || null,
        calc.excede_tope_desc,
        body.observaciones || null,
        convenioData?.id || null,
        convenioData?.razon_social || null,
        convenioData?.tipo_beneficio || null,
        convenioData?.valor_beneficio || null,
        calc.descuento_convenio,
        body.indice_ajuste || "NINGUNO",
      ]
    );
    const ventaId = ventaRes.rows[0].id;
    const ventaNro = ventaRes.rows[0].nro;

    let orden = 1;
    for (const t of body.titulares) {
      await client.query(
        `INSERT INTO ${schema}.venta_titulares 
          (venta_id, persona_id, porcentaje, solidario, orden, fecha_alta)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, CURRENT_DATE)`,
        [ventaId, t.persona_id, t.porcentaje, t.solidario || false, orden++]
      );
    }
    
    await client.query(
      `UPDATE ${schema}.lotes SET estado = 'RESERVADO'::tenant_template.lote_estado WHERE id = $1::uuid`,
      [body.lote_id]
    );

    const motivoVenta = convenioData
      ? `Venta creada con convenio ${convenioData.razon_social} (${convenioData.tipo_beneficio === "PORCENTAJE" ? convenioData.valor_beneficio + "%" : "$" + convenioData.valor_beneficio})`
      : "Venta creada";
    
    await client.query(
      `INSERT INTO ${schema}.venta_historial
         (venta_id, estado_anterior, estado_nuevo, usuario_label, motivo)
       VALUES ($1::uuid, NULL, 'EN_CARGA', 'admin', $2)`,
      [ventaId, motivoVenta]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      venta_id: ventaId,
      venta_nro: ventaNro,
      precio_boleto: calc.precio_boleto,
      cuota_base: calc.cuota_base,
      requiere_autorizacion: calc.excede_tope_desc,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error creando venta:", err);
    return NextResponse.json({ error: err.message || "Error al crear venta" }, { status: 500 });
  } finally {
    client.release();
  }
}
