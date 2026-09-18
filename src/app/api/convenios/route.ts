import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getPool } from "@/lib/db";
import { validarCuit } from "@/lib/cuit-validator";

/**
 * GET /api/convenios
 *   ?activo=true/false (default: all)
 *   ?q=texto (busca en razon_social o cuit)
 *
 * Devuelve listado con conteo de ventas asociadas (para saber si se puede borrar fÃ­sico).
 */
export async function GET(req: NextRequest) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const sp = req.nextUrl.searchParams;
  const activo = sp.get("activo");
  const q = (sp.get("q") || "").trim();

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (activo === "true") {
    conditions.push("c.activo = true");
  } else if (activo === "false") {
    conditions.push("c.activo = false");
  }

  if (q.length > 0) {
    conditions.push(`(c.razon_social ILIKE $${idx} OR c.cuit ILIKE $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Sumar ventas asociadas en los 4 tenants (para saber si se puede eliminar)
  const rows = await query(
    `
    SELECT 
      c.id, c.razon_social, c.cuit, c.fecha_inicio, c.fecha_fin,
      c.tipo_beneficio::text, c.valor_beneficio,
      c.tenants_aplicables, c.activo, c.observaciones,
      c.created_at, c.updated_at,
      COALESCE((SELECT COUNT(*) FROM tenant_jacaranda.ventas WHERE convenio_id = c.id), 0) +
      COALESCE((SELECT COUNT(*) FROM tenant_tipuana.ventas WHERE convenio_id = c.id), 0) +
      COALESCE((SELECT COUNT(*) FROM tenant_alisos.ventas WHERE convenio_id = c.id), 0) +
      COALESCE((SELECT COUNT(*) FROM tenant_boulevard.ventas WHERE convenio_id = c.id), 0) AS ventas_count
    FROM shared.convenios c
    ${where}
    ORDER BY c.razon_social ASC, c.fecha_inicio DESC
    `,
    params
  );

  return NextResponse.json({ convenios: rows });
}

/**
 * POST /api/convenios
 * Crea un nuevo convenio.
 */
export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.ADMIN_ONLY);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  // Validaciones
  if (!body.razon_social || body.razon_social.trim().length < 2) {
    return NextResponse.json({ error: "RazÃ³n social requerida" }, { status: 400 });
  }
  
  const cuitVal = validarCuit(body.cuit || "");
  if (!cuitVal.valido) {
    return NextResponse.json({ error: `CUIT invÃ¡lido: ${cuitVal.error}` }, { status: 400 });
  }
  
  if (!body.fecha_inicio || !body.fecha_fin) {
    return NextResponse.json({ error: "Fechas de vigencia requeridas" }, { status: 400 });
  }
  if (body.fecha_fin < body.fecha_inicio) {
    return NextResponse.json({ error: "Fecha fin debe ser >= fecha inicio" }, { status: 400 });
  }
  
  if (!["PORCENTAJE", "MONTO_FIJO"].includes(body.tipo_beneficio)) {
    return NextResponse.json({ error: "tipo_beneficio invÃ¡lido" }, { status: 400 });
  }
  
  const valor = parseFloat(body.valor_beneficio);
  if (isNaN(valor) || valor <= 0) {
    return NextResponse.json({ error: "Valor del beneficio debe ser mayor a 0" }, { status: 400 });
  }
  if (body.tipo_beneficio === "PORCENTAJE" && valor > 100) {
    return NextResponse.json({ error: "Porcentaje no puede superar 100%" }, { status: 400 });
  }
  
  const tenants = Array.isArray(body.tenants_aplicables) && body.tenants_aplicables.length > 0
    ? body.tenants_aplicables
    : ["jacaranda", "tipuana", "alisos", "boulevard"];

  const pool = getPool();
  const client = await pool.connect();

  try {
    const res = await client.query(
      `INSERT INTO shared.convenios
         (razon_social, cuit, fecha_inicio, fecha_fin, tipo_beneficio, valor_beneficio,
          tenants_aplicables, observaciones, created_by_label)
       VALUES ($1, $2, $3::date, $4::date, $5::shared.convenio_tipo_beneficio, $6,
               $7::jsonb, $8, $9)
       RETURNING id`,
      [
        body.razon_social.trim(),
        cuitVal.cuitNormalizado,
        body.fecha_inicio,
        body.fecha_fin,
        body.tipo_beneficio,
        valor,
        JSON.stringify(tenants),
        body.observaciones?.trim() || null,
        sessionLabel(session),
      ]
    );
    
    return NextResponse.json({ ok: true, id: res.rows[0].id });
  } catch (err: any) {
    console.error("Error crear convenio:", err);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
