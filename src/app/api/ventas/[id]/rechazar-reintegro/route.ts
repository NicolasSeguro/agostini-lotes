import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial, getVentaParaTransicion } from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  motivo: string;
};

/**
 * POST /api/ventas/[id]/rechazar-reintegro
 * 
 * El cajero rechaza la solicitud de reintegro (ej: cliente no se presentó,
 * datos incompletos, etc.). La venta vuelve al estado de rechazo anterior
 * (RECHAZADA_COMERCIAL o RECHAZADA_CONTABILIDAD) según corresponda.
 * 
 * Si la venta venía de un rechazo, vuelve a ese estado. Si venía de otro lado
 * (EN_CARGA / CERRADA_PENDIENTE), vuelve a EN_CARGA por simplicidad.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.CAJA);
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
    return NextResponse.json({ error: "Motivo obligatorio (mínimo 3 caracteres)" }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const venta = await getVentaParaTransicion(client, schema, id, ["PENDIENTE_REINTEGRO"]);

    // Determinar a qué estado volver: mirar el historial reciente para encontrar
    // el estado RECHAZADA_* anterior o EN_CARGA
    const hist = await client.query(
      `SELECT estado_anterior FROM ${schema}.venta_historial
       WHERE venta_id = $1::uuid AND estado_nuevo = 'PENDIENTE_REINTEGRO'
       ORDER BY fecha DESC LIMIT 1`,
      [id]
    );
    const estadoOriginal = hist.rows[0]?.estado_anterior || "EN_CARGA";

    await client.query(
      `UPDATE ${schema}.ventas
       SET estado = $2::tenant_template.venta_estado,
           solicitud_reintegro_motivo = NULL,
           solicitud_reintegro_at = NULL,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id, estadoOriginal]
    );

    await registrarHistorial(
      client, schema, id,
      "PENDIENTE_REINTEGRO", estadoOriginal,
      `Caja rechazó el reintegro: ${body.motivo.trim()}`, sessionLabel(session),
      { motivo_rechazo_caja: body.motivo.trim() }
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      nuevo_estado: estadoOriginal,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
