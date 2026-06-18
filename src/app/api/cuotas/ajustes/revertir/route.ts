import { NextRequest, NextResponse } from "next/server";
import { query, getSchema } from "@/lib/db";

/**
 * POST /api/cuotas/ajustes/revertir
 * Revierte una corrida EJECUTADA. MODIFICA datos.
 */

type Body = {
  tenant: string;
  ajuste_id: string;
  motivo_reversion: string;
  usuario?: string | null;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!body.ajuste_id || !/^[0-9a-f-]{36}$/i.test(body.ajuste_id)) {
    return NextResponse.json({ error: "ajuste_id (UUID) requerido y valido" }, { status: 400 });
  }
  if (!body.motivo_reversion || body.motivo_reversion.trim().length === 0) {
    return NextResponse.json({ error: "motivo_reversion es obligatorio" }, { status: 400 });
  }

  try {
    const schema = getSchema(body.tenant);

    const rows = await query<{ revertir_ajuste: number }>(
      `
      SELECT ${schema}.revertir_ajuste(
        $1::uuid, $2::text, $3::uuid
      ) AS revertir_ajuste
      `,
      [body.ajuste_id, body.motivo_reversion.trim(), body.usuario || null]
    );

    const cuotasRestauradas = rows[0]?.revertir_ajuste || 0;

    const corrida = await query(
      `SELECT * FROM ${schema}.ajustes_ejecuciones WHERE id = $1::uuid`,
      [body.ajuste_id]
    );

    return NextResponse.json({
      ok: true,
      cuotas_restauradas: cuotasRestauradas,
      corrida: corrida[0],
    });
  } catch (err: any) {
    console.error("[ajustes/revertir] ERROR:", err.message, err.detail);
    return NextResponse.json(
      { error: `Error al revertir ajuste: ${err.message}`, sql_detail: err.detail || null },
      { status: 500 }
    );
  }
}