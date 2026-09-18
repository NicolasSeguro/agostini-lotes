import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial, getVentaParaTransicion } from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  observaciones?: string | null;
};

/**
 * POST /api/ventas/[id]/autorizar
 * 
 * El Gerente Comercial autoriza una venta CERRADA_CONFIRMADA → AUTORIZADA.
 * Si la venta tenía requiere_aut_desc_fin = true, también se autoriza el descuento extra.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.GERENCIA);
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

    // Solo se puede autorizar desde CERRADA_CONFIRMADA
    const venta = await getVentaParaTransicion(client, schema, id, ["CERRADA_CONFIRMADA"]);
    const requeriaAuthDesc = venta.requiere_aut_desc_fin;

    await client.query(
      `UPDATE ${schema}.ventas 
       SET estado = 'AUTORIZADA'::tenant_template.venta_estado,
           fecha_autorizada = NOW(),
           ${requeriaAuthDesc ? "desc_fin_autorizado_at = NOW()," : ""}
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id]
    );

    const motivo = requeriaAuthDesc
      ? `Venta autorizada (incluye autorización de descuento financiero por encima del tope)`
      : `Venta autorizada por Gerente Comercial`;

    await registrarHistorial(
      client, schema, id,
      "CERRADA_CONFIRMADA", "AUTORIZADA",
      body.observaciones || motivo, sessionLabel(session),
      { autoriza_desc_fin: requeriaAuthDesc }
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      nuevo_estado: "AUTORIZADA",
      autorizo_descuento: requeriaAuthDesc,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error autorizar venta:", err);
    return NextResponse.json({ error: err.message || "Error al autorizar" }, { status: 500 });
  } finally {
    client.release();
  }
}
