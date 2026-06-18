import { NextRequest, NextResponse } from "next/server";
import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial, getVentaParaTransicion } from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  motivo?: string;
};

/**
 * POST /api/ventas/[id]/volver-a-carga
 *
 * Vendedor lleva una venta CERRADA_PENDIENTE de vuelta a EN_CARGA para editarla.
 * Las cobranzas de anticipo se mantienen vivas (cuando vuelva a cerrar, se aplican).
 *
 * Solo se permite desde CERRADA_PENDIENTE (mientras el anticipo no estÃ¡ completo).
 * En CERRADA_CONFIRMADA o mÃ¡s allÃ¡, NO se permite (la venta ya iniciÃ³ el flujo de
 * aprobaciÃ³n y solo se puede modificar vÃ­a rechazo).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const venta = await getVentaParaTransicion(client, schema, id, ["CERRADA_PENDIENTE"]);

    await client.query(
      `UPDATE ${schema}.ventas
       SET estado = 'EN_CARGA'::tenant_template.venta_estado,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id]
    );

    await registrarHistorial(
      client, schema, id,
      "CERRADA_PENDIENTE", "EN_CARGA",
      body.motivo?.trim()
        ? `Vendedor reabriÃ³ venta para editar: ${body.motivo.trim()}`
        : "Vendedor reabriÃ³ venta para editar",
      "admin"
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, nuevo_estado: "EN_CARGA" });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
