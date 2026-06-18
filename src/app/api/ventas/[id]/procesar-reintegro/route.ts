import { NextRequest, NextResponse } from "next/server";
import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial, getVentaParaTransicion } from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  medio_pago: string;
  banco_origen?: string | null;
  numero_operacion?: string | null;
  fecha?: string;
  observaciones?: string | null;
};

/**
 * POST /api/ventas/[id]/procesar-reintegro
 * 
 * El cajero procesa el reintegro al cliente.
 * Solo permitido en estado PENDIENTE_REINTEGRO.
 * 
 * Efectos:
 *   1. Crea registros en egresos_caja por cada cobranza vigente a anular
 *   2. Las cobranzas BORRADOR/CONFIRMADA pasan a ANULADA con cobranza_contra_id apuntando al egreso
 *   3. La venta pasa a ANULADA
 *   4. El lote vuelve a DISPONIBLE
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 });
  }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!body.medio_pago) return NextResponse.json({ error: "Medio de pago requerido" }, { status: 400 });

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const venta = await getVentaParaTransicion(client, schema, id, ["PENDIENTE_REINTEGRO"]);

    // Obtener cobranzas vigentes a anular
    const cobrRes = await client.query(
      `SELECT id, nro_recibo, monto_total, persona_id
       FROM ${schema}.cobranzas
       WHERE venta_id = $1::uuid AND es_anticipo_venta = true
         AND estado IN ('BORRADOR'::tenant_template.cobranza_estado, 'CONFIRMADA'::tenant_template.cobranza_estado)
       ORDER BY created_at ASC`,
      [id]
    );
    
    if (cobrRes.rows.length === 0) {
      throw new Error("No hay cobranzas vigentes para reintegrar");
    }

    const fechaEgreso = body.fecha || new Date().toISOString().slice(0, 10);
    const egresosCreados: Array<{ id: string; nro_orden: number; monto: number }> = [];

    // Crear un egreso por cada cobranza, y anular la cobranza
    for (const cob of cobrRes.rows) {
      const egresoRes = await client.query(
        `INSERT INTO ${schema}.egresos_caja
           (fecha, persona_id, monto_total, moneda, medio_pago,
            banco_origen, numero_operacion,
            cobranza_origen_id, venta_id, concepto, observaciones, created_by_label)
         VALUES ($1::date, $2::uuid, $3, 'ARS', $4::tenant_template.medio_pago,
                 $5, $6, $7::uuid, $8::uuid, 'REINTEGRO_ANULACION_VENTA', $9, 'admin')
         RETURNING id, nro_orden`,
        [
          fechaEgreso,
          cob.persona_id,
          parseFloat(cob.monto_total),
          body.medio_pago,
          body.banco_origen || null,
          body.numero_operacion || null,
          cob.id,
          id,
          body.observaciones || `Reintegro por anulaciÃ³n de venta (motivo solicitud: ${venta.solicitud_reintegro_motivo || "â€”"})`,
        ]
      );
      
      const egresoId = egresoRes.rows[0].id;
      const nroOrden = egresoRes.rows[0].nro_orden;
      egresosCreados.push({ 
        id: egresoId, 
        nro_orden: nroOrden, 
        monto: parseFloat(cob.monto_total) 
      });

      // Anular la cobranza original
      await client.query(
        `UPDATE ${schema}.cobranzas
         SET estado = 'ANULADA'::tenant_template.cobranza_estado,
             anulled_at = NOW(),
             anulled_reason = $2,
             cobranza_contra_id = $3::uuid
         WHERE id = $1::uuid`,
        [cob.id, `Reintegro procesado. Orden de pago #${nroOrden}`, egresoId]
      );
    }

    // Pasar venta a ANULADA
    await client.query(
      `UPDATE ${schema}.ventas
       SET estado = 'ANULADA'::tenant_template.venta_estado,
           reintegro_procesado_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id]
    );

    // Liberar el lote
    await client.query(
      `UPDATE ${schema}.lotes
       SET estado = 'DISPONIBLE'::tenant_template.lote_estado
       WHERE id = $1::uuid AND estado = 'RESERVADO'::tenant_template.lote_estado`,
      [venta.lote_id]
    );

    const totalReintegrado = egresosCreados.reduce((s, e) => s + e.monto, 0);

    await registrarHistorial(
      client, schema, id,
      "PENDIENTE_REINTEGRO", "ANULADA",
      `Reintegro procesado por Caja. Total: $${totalReintegrado.toLocaleString("es-AR")}. ${egresosCreados.length} orden(es) de pago: ${egresosCreados.map(e => "#" + e.nro_orden).join(", ")}`,
      "admin",
      {
        egresos: egresosCreados,
        total_reintegrado: totalReintegrado,
        medio_pago: body.medio_pago,
      }
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      nuevo_estado: "ANULADA",
      egresos: egresosCreados,
      total_reintegrado: totalReintegrado,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error procesar reintegro:", err);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
