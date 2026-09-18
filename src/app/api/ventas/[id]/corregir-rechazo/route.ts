import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial, getVentaParaTransicion } from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  permite_cambiar_lote?: boolean;
};

/**
 * POST /api/ventas/[id]/corregir-rechazo
 * 
 * El vendedor decide retomar la venta rechazada:
 *   - La venta vuelve a EN_CARGA
 *   - Las cobranzas de anticipo se mantienen vinculadas (no se tocan)
 *   - El lote sigue RESERVADO
 * 
 * permite_cambiar_lote: solo es un flag informativo del cliente.
 *                       La pantalla de edición decide si habilita el selector.
 * 
 * Estados origen permitidos:
 *   - RECHAZADA_COMERCIAL
 *   - RECHAZADA_CONTABILIDAD
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

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const venta = await getVentaParaTransicion(client, schema, id, [
      "RECHAZADA_COMERCIAL",
      "RECHAZADA_CONTABILIDAD",
    ]);

    await client.query(
      `UPDATE ${schema}.ventas
       SET estado = 'EN_CARGA'::tenant_template.venta_estado,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id]
    );

    await registrarHistorial(
      client, schema, id,
      venta.estado, "EN_CARGA",
      body.permite_cambiar_lote 
        ? "Vendedor reabre venta tras rechazo (permite cambiar lote)" 
        : "Vendedor reabre venta tras rechazo", sessionLabel(session),
      { 
        rechazo_anterior: venta.estado,
        permite_cambiar_lote: !!body.permite_cambiar_lote,
      }
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      nuevo_estado: "EN_CARGA",
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error corregir rechazo:", err);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
