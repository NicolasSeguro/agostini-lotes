import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import {
  getVentaParaTransicion,
  revertirReclasificacionInterno,
} from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  motivo?: string;
};

/**
 * POST /api/ventas/[id]/revertir-reclasificacion
 *
 * Deshace TODOS los descuentos_comerciales de la venta y restaura el anticipo.
 * La logica esta en @/lib/workflow-helpers para que pueda ser reutilizada
 * desde otros endpoints (ej: rechazar, anular).
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

    const venta = await getVentaParaTransicion(client, schema, id, ["AUTORIZADA"]);

    const resultado = await revertirReclasificacionInterno(
      client,
      schema,
      body.tenant,
      id,
      venta,
      body.motivo || "Reversion manual de Admin A",
      sessionLabel(session)
    );

    if (!resultado.tenia_reclasificacion) {
      throw new Error("Esta venta no tiene reclasificacion para revertir");
    }

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      monto_restaurado: resultado.monto_total,
      cobranzas_restauradas: resultado.cobranzas_restauradas,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error revertir reclasificacion:", err);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
