import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema, getPool } from "@/lib/db";

const ESTADOS_VALIDOS = ["EN_OBRA", "TERMINADO", "APROBADO"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;
  const tenant = req.nextUrl.searchParams.get("t") || "jacaranda";
  const schema = getSchema(tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const rows = await query(
    `
    SELECT 
      p.id, p.codigo, p.nombre, p.tipo_proyecto, p.estado,
      p.direccion, p.localidad, p.provincia,
      p.centro_lat, p.centro_lng, p.kmz_url,
      TO_CHAR(p.fecha_lanzamiento, 'YYYY-MM-DD') AS fecha_lanzamiento,
      p.config, p.activo,
      (SELECT COUNT(*) FROM ${schema}.lotes l WHERE l.proyecto_id = p.id)::int AS lotes_count
    FROM ${schema}.proyectos p
    WHERE p.id = $1::uuid
    `,
    [id]
  );
  if ((rows as any[]).length === 0) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  return NextResponse.json({ proyecto: (rows as any[])[0] });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.ADMIN_ONLY);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });
  if (!body.codigo || !body.codigo.trim()) return NextResponse.json({ error: "Código requerido" }, { status: 400 });
  if (!body.nombre || !body.nombre.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const estado = body.estado || "EN_OBRA";
  if (!ESTADOS_VALIDOS.includes(estado)) return NextResponse.json({ error: `Estado inválido: ${estado}` }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    const dup = await client.query(
      `SELECT id FROM ${schema}.proyectos WHERE UPPER(codigo) = UPPER($1) AND id != $2::uuid LIMIT 1`,
      [body.codigo.trim(), id]
    );
    if (dup.rows.length > 0) return NextResponse.json({ error: "Ya existe otro proyecto con ese código" }, { status: 409 });

    // Mergear config: traer la actual, sobrescribir solo el tope si vino
    const actual = await client.query(`SELECT config FROM ${schema}.proyectos WHERE id = $1::uuid`, [id]);
    if (actual.rows.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const config = actual.rows[0].config || {};
    if (body.tope_desc_financiero_pct !== null && body.tope_desc_financiero_pct !== undefined) {
      config.tope_desc_financiero_pct = body.tope_desc_financiero_pct / 100;
    }

    const res = await client.query(
      `
      UPDATE ${schema}.proyectos SET
        codigo = $2, nombre = $3, tipo_proyecto = $4, estado = $5,
        direccion = $6, localidad = $7, provincia = COALESCE($8, 'Jujuy'),
        centro_lat = $9, centro_lng = $10, kmz_url = $11,
        fecha_lanzamiento = $12::date,
        config = $13::jsonb,
        activo = $14,
        updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING id
      `,
      [
        id, body.codigo.trim(), body.nombre.trim(),
        body.tipo_proyecto?.trim() || null, estado,
        body.direccion?.trim() || null, body.localidad?.trim() || null, body.provincia?.trim() || null,
        body.centro_lat || null, body.centro_lng || null, body.kmz_url?.trim() || null,
        body.fecha_lanzamiento || null,
        JSON.stringify(config),
        body.activo !== false,
      ]
    );
    if (res.rows.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[editar-proyecto] ERROR:", err.message);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * DELETE:
 *  - sin fisico: baja lógica (activo=false)
 *  - fisico=true: borrado físico solo si no tiene lotes
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.ADMIN_ONLY);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;
  const tenant = req.nextUrl.searchParams.get("t") || "jacaranda";
  const fisico = req.nextUrl.searchParams.get("fisico") === "true";
  const schema = getSchema(tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    const cnt = await client.query(
      `SELECT COUNT(*) AS c FROM ${schema}.lotes WHERE proyecto_id = $1::uuid`, [id]
    );
    const lotesCount = parseInt(cnt.rows[0].c);

    if (fisico) {
      if (lotesCount > 0) {
        return NextResponse.json({ error: `No se puede eliminar: tiene ${lotesCount} lote(s). Usá desactivar.` }, { status: 400 });
      }
      const res = await client.query(`DELETE FROM ${schema}.proyectos WHERE id = $1::uuid RETURNING id`, [id]);
      if (res.rows.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      return NextResponse.json({ ok: true, eliminado: "fisico" });
    }

    const res = await client.query(
      `UPDATE ${schema}.proyectos SET activo = false, updated_at = NOW() WHERE id = $1::uuid AND activo = true RETURNING id`,
      [id]
    );
    if (res.rows.length === 0) return NextResponse.json({ error: "No encontrado o ya inactivo" }, { status: 404 });
    return NextResponse.json({ ok: true, eliminado: "logico" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
