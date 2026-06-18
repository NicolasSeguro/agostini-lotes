import { NextRequest, NextResponse } from "next/server";
import { query, getPool } from "@/lib/db";
import { validarCuit } from "@/lib/cuit-validator";

/**
 * GET /api/convenios/[id]
 * Devuelve un convenio + conteo de ventas asociadas.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  
  const rows = await query(
    `SELECT 
      c.id, c.razon_social, c.cuit, 
      TO_CHAR(c.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
      TO_CHAR(c.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
      c.tipo_beneficio::text, c.valor_beneficio,
      c.tenants_aplicables, c.activo, c.observaciones,
      c.created_at, c.updated_at,
      COALESCE((SELECT COUNT(*) FROM tenant_jacaranda.ventas WHERE convenio_id = c.id), 0) +
      COALESCE((SELECT COUNT(*) FROM tenant_tipuana.ventas WHERE convenio_id = c.id), 0) +
      COALESCE((SELECT COUNT(*) FROM tenant_alisos.ventas WHERE convenio_id = c.id), 0) +
      COALESCE((SELECT COUNT(*) FROM tenant_boulevard.ventas WHERE convenio_id = c.id), 0) AS ventas_count
    FROM shared.convenios c
    WHERE c.id = $1::uuid`,
    [id]
  );
  
  if ((rows as any[]).length === 0) {
    return NextResponse.json({ error: "Convenio no encontrado" }, { status: 404 });
  }
  
  return NextResponse.json({ convenio: (rows as any[])[0] });
}

/**
 * PUT /api/convenios/[id]
 * Edita un convenio. Las ventas asociadas YA congelaron sus valores,
 * asÃ­ que la ediciÃ³n solo afecta a futuras ventas que usen este convenio.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 }); }
  
  if (!body.razon_social || body.razon_social.trim().length < 2) {
    return NextResponse.json({ error: "RazÃ³n social requerida" }, { status: 400 });
  }
  
  const cuitVal = validarCuit(body.cuit || "");
  if (!cuitVal.valido) {
    return NextResponse.json({ error: `CUIT invÃ¡lido: ${cuitVal.error}` }, { status: 400 });
  }
  
  if (!body.fecha_inicio || !body.fecha_fin) {
    return NextResponse.json({ error: "Fechas requeridas" }, { status: 400 });
  }
  if (body.fecha_fin < body.fecha_inicio) {
    return NextResponse.json({ error: "Fecha fin debe ser >= fecha inicio" }, { status: 400 });
  }
  
  if (!["PORCENTAJE", "MONTO_FIJO"].includes(body.tipo_beneficio)) {
    return NextResponse.json({ error: "tipo_beneficio invÃ¡lido" }, { status: 400 });
  }
  
  const valor = parseFloat(body.valor_beneficio);
  if (isNaN(valor) || valor <= 0) {
    return NextResponse.json({ error: "Valor debe ser > 0" }, { status: 400 });
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
      `UPDATE shared.convenios SET
         razon_social = $2,
         cuit = $3,
         fecha_inicio = $4::date,
         fecha_fin = $5::date,
         tipo_beneficio = $6::shared.convenio_tipo_beneficio,
         valor_beneficio = $7,
         tenants_aplicables = $8::jsonb,
         observaciones = $9,
         activo = $10,
         updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id`,
      [
        id,
        body.razon_social.trim(),
        cuitVal.cuitNormalizado,
        body.fecha_inicio,
        body.fecha_fin,
        body.tipo_beneficio,
        valor,
        JSON.stringify(tenants),
        body.observaciones?.trim() || null,
        body.activo !== false,
      ]
    );
    
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Convenio no encontrado" }, { status: 404 });
    }
    
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error PUT convenio:", err);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/convenios/[id]?fisico=true
 *
 * Sin parÃ¡metro: baja lÃ³gica (activo = false). Permitido incluso con ventas asociadas.
 * Con ?fisico=true: borrado fÃ­sico. Solo si NO hay ventas asociadas.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const fisico = req.nextUrl.searchParams.get("fisico") === "true";
  
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    // Verificar si hay ventas asociadas
    const cntRes = await client.query(
      `SELECT 
        COALESCE((SELECT COUNT(*) FROM tenant_jacaranda.ventas WHERE convenio_id = $1::uuid), 0) +
        COALESCE((SELECT COUNT(*) FROM tenant_tipuana.ventas WHERE convenio_id = $1::uuid), 0) +
        COALESCE((SELECT COUNT(*) FROM tenant_alisos.ventas WHERE convenio_id = $1::uuid), 0) +
        COALESCE((SELECT COUNT(*) FROM tenant_boulevard.ventas WHERE convenio_id = $1::uuid), 0) AS cnt`,
      [id]
    );
    const ventasCount = parseInt(cntRes.rows[0].cnt);
    
    if (fisico) {
      if (ventasCount > 0) {
        return NextResponse.json({ 
          error: `No se puede eliminar: tiene ${ventasCount} venta(s) asociada(s). Usar baja lÃ³gica.` 
        }, { status: 400 });
      }
      const res = await client.query(
        `DELETE FROM shared.convenios WHERE id = $1::uuid RETURNING id`,
        [id]
      );
      if (res.rows.length === 0) {
        return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, eliminado: "fisico" });
    }
    
    // Baja lÃ³gica
    const res = await client.query(
      `UPDATE shared.convenios 
       SET activo = false, updated_at = NOW()
       WHERE id = $1::uuid AND activo = true
       RETURNING id`,
      [id]
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "No encontrado o ya estaba dado de baja" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, eliminado: "logico" });
    
  } catch (err: any) {
    console.error("Error DELETE convenio:", err);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
