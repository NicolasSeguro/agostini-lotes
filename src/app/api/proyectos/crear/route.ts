import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";

type Body = {
  tenant: string;
  codigo: string;
  nombre: string;
  tipo_proyecto?: string | null;
  estado?: string;
  direccion?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  centro_lat?: number | null;
  centro_lng?: number | null;
  kmz_url?: string | null;
  fecha_lanzamiento?: string | null;
  tope_desc_financiero_pct?: number | null;  // entra como % (10 = 10%)
};

const ESTADOS_VALIDOS = ["EN_OBRA", "TERMINADO", "APROBADO"];

export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.ADMIN_ONLY);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!body.codigo || !body.codigo.trim()) return NextResponse.json({ error: "CÃ³digo requerido" }, { status: 400 });
  if (!body.nombre || !body.nombre.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const estado = body.estado || "EN_OBRA";
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return NextResponse.json({ error: `Estado invÃ¡lido: ${estado}` }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    // Validar cÃ³digo Ãºnico
    const dup = await client.query(
      `SELECT id FROM ${schema}.proyectos WHERE UPPER(codigo) = UPPER($1) LIMIT 1`,
      [body.codigo.trim()]
    );
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: `Ya existe un proyecto con el cÃ³digo ${body.codigo}` }, { status: 409 });
    }

    // Armar config JSONB
    const config: any = {};
    if (body.tope_desc_financiero_pct !== null && body.tope_desc_financiero_pct !== undefined) {
      // El campo se guarda como decimal (0.10 para 10%)
      config.tope_desc_financiero_pct = body.tope_desc_financiero_pct / 100;
    }

    const res = await client.query(
      `
      INSERT INTO ${schema}.proyectos
        (codigo, nombre, tipo_proyecto, estado, direccion, localidad, provincia,
         centro_lat, centro_lng, kmz_url, fecha_lanzamiento, config, activo)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12::jsonb, true)
      RETURNING id
      `,
      [
        body.codigo.trim(),
        body.nombre.trim(),
        body.tipo_proyecto?.trim() || null,
        estado,
        body.direccion?.trim() || null,
        body.localidad?.trim() || null,
        body.provincia?.trim() || "Jujuy",
        body.centro_lat || null,
        body.centro_lng || null,
        body.kmz_url?.trim() || null,
        body.fecha_lanzamiento || null,
        JSON.stringify(config),
      ]
    );
    return NextResponse.json({ ok: true, id: res.rows[0].id });
  } catch (err: any) {
    console.error("[crear-proyecto] ERROR:", err.message);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
