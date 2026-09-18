import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial, getVentaParaTransicion } from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  motivo: string;
};

/**
 * POST /api/ventas/[id]/solicitar-anulacion
 * 
 * El vendedor solicita anular la venta y reintegrar el anticipo al cliente.
 * La venta pasa a PENDIENTE_REINTEGRO y aparece en el panel de Caja.
 * 
 * Estados origen permitidos:
 *   - RECHAZADA_COMERCIAL
 *   - RECHAZADA_CONTABILIDAD
 *   - (tambiÃ©n desde EN_CARGA si la venta tiene anticipo cobrado y el vendedor decide anular)
 * 
 * Si la venta NO tiene anticipo cobrado, no tiene sentido pasar por caja:
 * se anula directo (es un cambio futuro, por ahora exigimos cobranzas).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.VENTAS);
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
  if (!body.motivo || body.motivo.trim().length < 3) {
    return NextResponse.json({ error: "Motivo obligatorio (mÃ­nimo 3 caracteres)" }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const venta = await getVentaParaTransicion(client, schema, id, [
      "RECHAZADA_COMERCIAL",
      "RECHAZADA_CONTABILIDAD",
      "EN_CARGA",
      "CERRADA_PENDIENTE",
    ]);

    // Validar que haya cobranza viva para reintegrar
    const cobr = await client.query(
      `SELECT COUNT(*)::int AS cant, COALESCE(SUM(monto_total), 0)::numeric AS total
       FROM ${schema}.cobranzas
       WHERE venta_id = $1::uuid 
         AND es_anticipo_venta = true
         AND estado IN ('BORRADOR'::tenant_template.cobranza_estado, 'CONFIRMADA'::tenant_template.cobranza_estado)`,
      [id]
    );
    
    if (cobr.rows[0].cant === 0) {
      // Sin anticipo cobrado: anular directo (no requiere reintegro)
      await client.query(
        `UPDATE ${schema}.ventas
         SET estado = 'ANULADA'::tenant_template.venta_estado,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [id]
      );
      
      // Liberar lote
      await client.query(
        `UPDATE ${schema}.lotes 
         SET estado = 'DISPONIBLE'::tenant_template.lote_estado
         WHERE id = $1::uuid AND estado = 'RESERVADO'::tenant_template.lote_estado`,
        [venta.lote_id]
      );
      
      await registrarHistorial(
        client, schema, id,
        venta.estado, "ANULADA",
        `AnulaciÃ³n sin reintegro (sin anticipo cobrado): ${body.motivo.trim()}`, sessionLabel(session)
      );
      
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, nuevo_estado: "ANULADA", requiere_reintegro: false });
    }

    // Con anticipo: pasar a PENDIENTE_REINTEGRO
    await client.query(
      `UPDATE ${schema}.ventas
       SET estado = 'PENDIENTE_REINTEGRO'::tenant_template.venta_estado,
           solicitud_reintegro_motivo = $2,
           solicitud_reintegro_at = NOW(),
           solicitud_reintegro_por = NULL,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id, body.motivo.trim()]
    );

    await registrarHistorial(
      client, schema, id,
      venta.estado, "PENDIENTE_REINTEGRO",
      `Solicitud de anulaciÃ³n con reintegro: ${body.motivo.trim()}`, sessionLabel(session),
      { 
        monto_a_reintegrar: parseFloat(cobr.rows[0].total),
        cobranzas_activas: cobr.rows[0].cant,
      }
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      nuevo_estado: "PENDIENTE_REINTEGRO",
      requiere_reintegro: true,
      monto_a_reintegrar: parseFloat(cobr.rows[0].total),
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error solicitar anulaciÃ³n:", err);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
