import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import {
  registrarHistorial,
  getVentaParaTransicion,
  generarFechasVencimiento,
  descomponerCuota,
} from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  fecha_primer_vto?: string; // Si se especifica, sobrescribe la de la venta
  observaciones?: string | null;
};

/**
 * POST /api/ventas/[id]/contabilizar
 * 
 * Admin A contabiliza una venta AUTORIZADA. Acciones:
 *   1. Confirma todas las cobranzas BORRADOR de anticipo → CONFIRMADA
 *   2. Genera el plan de cuotas (N cuotas con cuota_base actual)
 *   3. Pasa lote a VENDIDO
 *   4. Pasa venta a CONTABILIZADA
 * 
 * Si fecha_primer_vto se especifica, se usa esa fecha. Si no, la de la venta.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.CONTABILIDAD);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Validar venta en AUTORIZADA
    const venta = await getVentaParaTransicion(client, schema, id, ["AUTORIZADA"]);

    // 2) Tomar fecha del primer vto (de body o de venta)
    const fechaPrimerVto = body.fecha_primer_vto || 
      (venta.fecha_primer_vto ? new Date(venta.fecha_primer_vto).toISOString().slice(0, 10) : null);
    
    if (!fechaPrimerVto) {
      throw new Error("La venta no tiene fecha de primer vencimiento");
    }

    // 3) Obtener parámetros del tenant
    const tenantConfig = await client.query(
      `SELECT COALESCE((config->>'porc_gravado')::numeric, 0) AS porc_gravado FROM shared.tenants WHERE slug = $1`,
      [body.tenant]
    );
    const porcGravado = parseFloat(tenantConfig.rows[0]?.porc_gravado || 0);

    // 4) Calcular descomposición de cada cuota
    const cantCuotas = parseInt(venta.cant_cuotas);
    const cuotaBase = parseFloat(venta.cuota_base);
    const sistema = venta.sistema_amort; // FRANCES o FIJO_SIN_INTERES
    const tasaMensual = parseFloat(venta.tasa_interes_mensual || 0) / 100;
    
    // Para Francés: calcular porcentaje de interés del primer pago para descomponer
    // (en Francés cada cuota tiene proporción distinta capital/interés pero por simplicidad
    //  vamos a descomponer cada cuota individualmente con sus números)
    
    const fechasVto = generarFechasVencimiento(fechaPrimerVto, cantCuotas);
    const hoyStr = new Date().toISOString().slice(0, 10);
    
    // 5) Borrar cuotas existentes (por si se contabiliza tras un reintento)
    await client.query(`DELETE FROM ${schema}.cuotas WHERE venta_id = $1::uuid`, [id]);
    
    // 6) Generar cuotas
    if (sistema === "FRANCES" && tasaMensual > 0) {
      // En Francés: tabla de amortización clásica
      let saldoCapital = parseFloat(venta.precio_total) - parseFloat(venta.anticipo);
      
      for (let i = 0; i < cantCuotas; i++) {
        const interesCuota = saldoCapital * tasaMensual;
        const capitalCuota = cuotaBase - interesCuota;
        const porcInteres = cuotaBase > 0 ? interesCuota / cuotaBase : 0;
        
        const desc = descomponerCuota(cuotaBase, porcGravado, porcInteres);
        const estadoInicial = fechasVto[i] < hoyStr ? 'MORA' : 'EMITIDA';
        
        await client.query(
          `INSERT INTO ${schema}.cuotas
             (venta_id, numero, fecha_vto,
              capital_gr_orig, capital_ex_orig, iva_capital_orig,
              interes_gr_orig, interes_ex_orig, iva_interes_orig,
              estado)
           VALUES ($1::uuid, $2, $3::date, $4, $5, $6, $7, $8, $9,
                   $10::tenant_template.cuota_estado)`,
          [
            id, i + 1, fechasVto[i],
            desc.capital_gr_orig, desc.capital_ex_orig, desc.iva_capital_orig,
            desc.interes_gr_orig, desc.interes_ex_orig, desc.iva_interes_orig,
            estadoInicial,
          ]
        );
        
        saldoCapital -= capitalCuota;
      }
    } else {
      // Ajustable (FIJO_SIN_INTERES): todas las cuotas iguales, sin interés
      const desc = descomponerCuota(cuotaBase, porcGravado, 0);
      
      for (let i = 0; i < cantCuotas; i++) {
        const estadoInicial = fechasVto[i] < hoyStr ? 'MORA' : 'EMITIDA';
        
        await client.query(
          `INSERT INTO ${schema}.cuotas
             (venta_id, numero, fecha_vto,
              capital_gr_orig, capital_ex_orig, iva_capital_orig,
              interes_gr_orig, interes_ex_orig, iva_interes_orig,
              estado)
           VALUES ($1::uuid, $2, $3::date, $4, $5, $6, 0, 0, 0,
                   $7::tenant_template.cuota_estado)`,
          [
            id, i + 1, fechasVto[i],
            desc.capital_gr_orig, desc.capital_ex_orig, desc.iva_capital_orig,
            estadoInicial,
          ]
        );
      }
    }

    // 7) Confirmar cobranzas de anticipo (BORRADOR → CONFIRMADA)
    const cobranzasConfirmadas = await client.query(
      `UPDATE ${schema}.cobranzas
       SET estado = 'CONFIRMADA'::tenant_template.cobranza_estado,
           confirmed_at = NOW()
       WHERE venta_id = $1::uuid 
         AND es_anticipo_venta = true
         AND estado = 'BORRADOR'::tenant_template.cobranza_estado
       RETURNING id, nro_recibo`,
      [id]
    );

    // 8) Cambiar lote a VENDIDO
    await client.query(
      `UPDATE ${schema}.lotes 
       SET estado = 'VENDIDO'::tenant_template.lote_estado
       WHERE id = $1::uuid`,
      [venta.lote_id]
    );

    // 9) Pasar venta a CONTABILIZADA
    await client.query(
      `UPDATE ${schema}.ventas 
       SET estado = 'CONTABILIZADA'::tenant_template.venta_estado,
           fecha_contabilizada = NOW(),
           fecha_primer_vto = $2::date,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id, fechaPrimerVto]
    );

    // 10) Registrar en historial
    await registrarHistorial(
      client, schema, id,
      "AUTORIZADA", "CONTABILIZADA",
      body.observaciones || `Venta contabilizada. ${cantCuotas} cuotas generadas, ${cobranzasConfirmadas.rows.length} recibos confirmados`, sessionLabel(session),
      {
        cant_cuotas: cantCuotas,
        fecha_primer_vto: fechaPrimerVto,
        cobranzas_confirmadas: cobranzasConfirmadas.rows.map(c => ({ id: c.id, nro_recibo: c.nro_recibo })),
      }
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      nuevo_estado: "CONTABILIZADA",
      cuotas_generadas: cantCuotas,
      fecha_primer_vto: fechaPrimerVto,
      recibos_confirmados: cobranzasConfirmadas.rows.length,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error contabilizar:", err);
    return NextResponse.json({ error: err.message || "Error al contabilizar" }, { status: 500 });
  } finally {
    client.release();
  }
}
