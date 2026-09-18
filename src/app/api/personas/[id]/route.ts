import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema, getPool } from "@/lib/db";

const TENANT_TABLES_VENTAS: Record<string, string> = {
  jacaranda: "tenant_jacaranda",
  tipuana: "tenant_tipuana",
  alisos: "tenant_alisos",
  boulevard: "tenant_boulevard",
};

/**
 * GET /api/personas/[id]?t=tenant
 * Devuelve la persona completa + conteo de ventas asociadas.
 */
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
      p.id, p.tipo::text AS tipo, p.doc_tipo::text AS doc_tipo, p.doc_numero, p.cuit,
      p.apellido, p.nombre, p.razon_social, p.cond_iva::text AS cond_iva,
      TO_CHAR(p.fecha_nac, 'YYYY-MM-DD') AS fecha_nac,
      p.estado_civil, p.profesion, p.actividad,
      p.sujeto_obligado, p.sujeto_expuesto,
      TO_CHAR(p.inicio_actividad, 'YYYY-MM-DD') AS inicio_actividad,
      p.email, p.email_alt, p.telefono, p.telefono_alt,
      p.direccion_calle, p.direccion_numero, p.direccion_barrio, p.direccion_localidad,
      p.direccion_provincia, p.direccion_pais,
      p.referente_nombre, p.referente_doc_tipo, p.referente_doc_numero, p.referente_cargo,
      p.observaciones, p.activo,
      COALESCE((SELECT COUNT(*) FROM ${schema}.ventas v
        JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id
        WHERE vt.persona_id = p.id), 0) AS ventas_count
    FROM ${schema}.personas p
    WHERE p.id = $1::uuid
    `,
    [id]
  );
  if ((rows as any[]).length === 0) {
    return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ persona: (rows as any[])[0] });
}

/**
 * PUT /api/personas/[id]  â€” editar persona
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.VENTAS);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  if (body.tipo === "JURIDICA") {
    if (!body.cuit || body.cuit.replace(/[^0-9]/g, "").length < 10) {
      return NextResponse.json({ error: "El CUIT es obligatorio para persona jurÃ­dica" }, { status: 400 });
    }
    if (!body.doc_numero || !body.doc_numero.trim()) {
      body.doc_numero = body.cuit.replace(/[^0-9]/g, "");
      body.doc_tipo = "CUIT";
    }
  } else {
    if (!body.doc_numero || body.doc_numero.trim().length < 5) {
      return NextResponse.json({ error: "NÃºmero de documento invÃ¡lido" }, { status: 400 });
    }
  }
  if (body.tipo === "FISICA" && (!body.apellido || !body.nombre)) {
    return NextResponse.json({ error: "Apellido y nombre obligatorios" }, { status: 400 });
  }
  if (body.tipo === "JURIDICA" && !body.razon_social) {
    return NextResponse.json({ error: "RazÃ³n social obligatoria" }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    // Validar que no haya OTRA persona con el mismo documento
    const dup = await client.query(
      `SELECT id FROM ${schema}.personas WHERE doc_numero = $1 AND id != $2::uuid AND deleted_at IS NULL LIMIT 1`,
      [body.doc_numero.trim(), id]
    );
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: "Ya existe otra persona con ese documento" }, { status: 409 });
    }

    const res = await client.query(
      `
      UPDATE ${schema}.personas SET
        tipo = $2::shared.persona_tipo, doc_tipo = $3::shared.doc_tipo, doc_numero = $4,
        cuit = $5, apellido = $6, nombre = $7, razon_social = $8, cond_iva = $9::shared.cond_iva,
        fecha_nac = $10::date, estado_civil = $11, profesion = $12, actividad = $13,
        sujeto_obligado = $14, sujeto_expuesto = $15, inicio_actividad = $16::date,
        email = $17, email_alt = $18, telefono = $19, telefono_alt = $20,
        direccion_calle = $21, direccion_numero = $22, direccion_barrio = $23, direccion_localidad = $24,
        direccion_provincia = $25, direccion_pais = COALESCE($26,'Argentina'),
        referente_nombre = $27, referente_doc_tipo = $28, referente_doc_numero = $29, referente_cargo = $30,
        observaciones = $31, activo = $32,
        updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING id
      `,
      [
        id, body.tipo, body.doc_tipo, body.doc_numero.trim(),
        body.cuit?.trim() || null, body.apellido?.trim() || null, body.nombre?.trim() || null, body.razon_social?.trim() || null, body.cond_iva || "CF",
        body.fecha_nac || null, body.estado_civil || null, body.profesion?.trim() || null, body.actividad?.trim() || null,
        body.sujeto_obligado || false, body.sujeto_expuesto || false, body.inicio_actividad || null,
        body.email?.trim() || null, body.email_alt?.trim() || null, body.telefono?.trim() || null, body.telefono_alt?.trim() || null,
        body.direccion_calle?.trim() || null, body.direccion_numero?.trim() || null, body.direccion_barrio?.trim() || null, body.direccion_localidad?.trim() || null,
        body.direccion_provincia?.trim() || null, body.direccion_pais?.trim() || null,
        body.referente_nombre?.trim() || null, body.referente_doc_tipo || null, body.referente_doc_numero?.trim() || null, body.referente_cargo?.trim() || null,
        body.observaciones?.trim() || null, body.activo !== false,
      ]
    );
    if (res.rows.length === 0) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[editar-persona] ERROR:", err.message);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/personas/[id]?t=tenant&fisico=true
 *  - sin fisico: baja lÃ³gica (activo = false)
 *  - con fisico=true: borrado fÃ­sico, solo si no tiene ventas asociadas
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.VENTAS);
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
      `SELECT COUNT(*) AS c FROM ${schema}.venta_titulares WHERE persona_id = $1::uuid`,
      [id]
    );
    const ventasCount = parseInt(cnt.rows[0].c);

    if (fisico) {
      if (ventasCount > 0) {
        return NextResponse.json({ error: `No se puede eliminar: tiene ${ventasCount} venta(s) asociada(s). UsÃ¡ desactivar.` }, { status: 400 });
      }
      // Borrar roles primero (FK)
      await client.query(`DELETE FROM ${schema}.persona_roles WHERE persona_id = $1::uuid`, [id]);
      const res = await client.query(`DELETE FROM ${schema}.personas WHERE id = $1::uuid RETURNING id`, [id]);
      if (res.rows.length === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
      return NextResponse.json({ ok: true, eliminado: "fisico" });
    }

    // Baja lÃ³gica
    const res = await client.query(
      `UPDATE ${schema}.personas SET activo = false, updated_at = NOW() WHERE id = $1::uuid AND activo = true RETURNING id`,
      [id]
    );
    if (res.rows.length === 0) return NextResponse.json({ error: "No encontrada o ya inactiva" }, { status: 404 });
    return NextResponse.json({ ok: true, eliminado: "logico" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
