import { NextRequest, NextResponse } from "next/server";
import { query, getSchema, getPool } from "@/lib/db";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tenant = req.nextUrl.searchParams.get("t") || "jacaranda";
  const schema = getSchema(tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  const rows = await query(
    `
    SELECT 
      l.id, l.proyecto_id, l.numero, l.manzana, l.numero_padron,
      l.superficie_m2, l.frente_ml, l.fondo_ml, l.zona,
      l.precio_lista, l.precio_x_m2, l.coeficiente, l.moneda,
      l.estado::text AS estado, l.matricula,
      l.tiene_agua, l.tiene_luz, l.tiene_cloacas, l.tiene_gas,
      l.geom_json,
      (SELECT COUNT(*) FROM ${schema}.ventas v WHERE v.lote_id = l.id) AS ventas_count
    FROM ${schema}.lotes l
    WHERE l.id = $1::uuid
    `,
    [id]
  );
  if ((rows as any[]).length === 0) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  return NextResponse.json({ lote: (rows as any[])[0] });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });
  if (!body.numero || !body.numero.trim()) return NextResponse.json({ error: "NÃºmero requerido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    // Si el lote estÃ¡ VENDIDO/ESCRITURADO, no permitir cambiar datos crÃ­ticos (precio, estado)
    const actual = await client.query(
      `SELECT estado::text AS estado FROM ${schema}.lotes WHERE id = $1::uuid`, [id]
    );
    if (actual.rows.length === 0) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });

    const res = await client.query(
      `
      UPDATE ${schema}.lotes SET
        numero = $2, manzana = $3, numero_padron = $4,
        superficie_m2 = $5, frente_ml = $6, fondo_ml = $7, zona = $8,
        precio_lista = $9, precio_x_m2 = $10, coeficiente = $11, moneda = COALESCE($12,'ARS'),
        estado = $13::tenant_template.lote_estado, matricula = $14,
        tiene_agua = $15, tiene_luz = $16, tiene_cloacas = $17, tiene_gas = $18,
        geom_json = $19::jsonb,
        updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING id
      `,
      [
        id, body.numero.trim(), body.manzana?.trim() || null, body.numero_padron?.trim() || null,
        body.superficie_m2 || null, body.frente_ml || null, body.fondo_ml || null, body.zona?.trim() || null,
        body.precio_lista || null, body.precio_x_m2 || null, body.coeficiente || null, body.moneda || "ARS",
        body.estado || "DISPONIBLE", body.matricula?.trim() || null,
        body.tiene_agua || false, body.tiene_luz || false, body.tiene_cloacas || false, body.tiene_gas || false,
        body.geom_json ? JSON.stringify(body.geom_json) : null,
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[editar-lote] ERROR:", err.message);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tenant = req.nextUrl.searchParams.get("t") || "jacaranda";
  const schema = getSchema(tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    // Solo se puede borrar si no tiene ventas asociadas
    const cnt = await client.query(
      `SELECT COUNT(*) AS c FROM ${schema}.ventas WHERE lote_id = $1::uuid`, [id]
    );
    if (parseInt(cnt.rows[0].c) > 0) {
      return NextResponse.json({ error: `No se puede eliminar: el lote tiene ${cnt.rows[0].c} venta(s) asociada(s)` }, { status: 400 });
    }
    const res = await client.query(`DELETE FROM ${schema}.lotes WHERE id = $1::uuid RETURNING id`, [id]);
    if (res.rows.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
