import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getPool } from "@/lib/db";

const COND_IVA_VALIDOS = ["RI", "MONO", "EXENTO", "CF", "NO_RESPONSABLE", "RNI", "EXTERIOR"];

/**
 * GET /api/fideicomisos/[id]
 * Trae el fideicomiso (shared.tenants) por id o slug.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;

  // Aceptamos id (UUID) o slug
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const cond = isUuid ? "id = $1::uuid" : "slug = $1";

  const rows = await query(
    `
    SELECT 
      id, slug, schema_name, tipo, razon_social, nombre_fantasia, cuit,
      cond_iva::text AS cond_iva,
      TO_CHAR(inicio_actividad, 'YYYY-MM-DD') AS inicio_actividad,
      domicilio_fiscal, config, datos_fiscales, activo
    FROM shared.tenants
    WHERE ${cond}
    `,
    [id]
  );
  if ((rows as any[]).length === 0) return NextResponse.json({ error: "Fideicomiso no encontrado" }, { status: 404 });
  return NextResponse.json({ fideicomiso: (rows as any[])[0] });
}

/**
 * PUT /api/fideicomisos/[id]
 * Actualiza datos del fideicomiso.
 *  - Columnas reales: razon_social, nombre_fantasia, cuit, cond_iva, inicio_actividad
 *  - JSONB domicilio_fiscal: calle, numero, localidad, cp, provincia
 *  - JSONB datos_fiscales: todo el bloque registral/fiscal/bancario + telefono + email
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.ADMIN_ONLY);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  if (!body.razon_social || !body.razon_social.trim()) {
    return NextResponse.json({ error: "RazÃ³n social requerida" }, { status: 400 });
  }
  if (!body.cuit || !body.cuit.trim()) {
    return NextResponse.json({ error: "CUIT requerido" }, { status: 400 });
  }

  const condIva = body.cond_iva || "RI";
  if (!COND_IVA_VALIDOS.includes(condIva)) {
    return NextResponse.json({ error: `CondiciÃ³n IVA invÃ¡lida: ${condIva}` }, { status: 400 });
  }

  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const condWhere = isUuid ? "id = $1::uuid" : "slug = $1";

  const pool = getPool();
  const client = await pool.connect();
  try {
    // Domicilio fiscal (reutiliza el JSONB existente; secciÃ³n "Domicilio legal" de la pantalla)
    const domicilio = {
      calle: body.domicilio?.calle?.trim() || null,
      numero: body.domicilio?.numero?.trim() || null,
      localidad: body.domicilio?.localidad?.trim() || null,
      cp: body.domicilio?.cp?.trim() || null,
      provincia: body.domicilio?.provincia?.trim() || null,
    };

    // Datos fiscales: armar el bloque completo (sobrescribe el JSONB entero al guardar)
    const datosFiscales = {
      telefono: body.telefono?.trim() || null,
      email: body.email?.trim() || null,
      reg_inmobiliario: {
        circunscripcion: body.reg_inm?.circunscripcion?.trim() || null,
        seccion: body.reg_inm?.seccion?.trim() || null,
        parcela: body.reg_inm?.parcela?.trim() || null,
        padron: body.reg_inm?.padron?.trim() || null,
        matricula: body.reg_inm?.matricula?.trim() || null,
      },
      escritura: {
        numero: body.escritura?.numero?.trim() || null,
        fecha: body.escritura?.fecha || null,
        escribano: body.escritura?.escribano?.trim() || null,
      },
      fiscalia_1: {
        folio: body.fiscalia_1?.folio?.trim() || null,
        acta: body.fiscalia_1?.acta?.trim() || null,
        libro: body.fiscalia_1?.libro?.trim() || null,
        fecha: body.fiscalia_1?.fecha || null,
      },
      fiscalia_2: {
        asiento: body.fiscalia_2?.asiento?.trim() || null,
        folio: body.fiscalia_2?.folio?.trim() || null,
        legajo: body.fiscalia_2?.legajo?.trim() || null,
        reg_mercantil: body.fiscalia_2?.reg_mercantil?.trim() || null,
        fecha: body.fiscalia_2?.fecha || null,
      },
      caracter_iva: body.caracter_iva || null,
      caracter_ganancias: body.caracter_ganancias || null,
      ingresos_brutos: body.ingresos_brutos?.trim() || null,
      mes_cierre_ejercicio: body.mes_cierre_ejercicio !== null && body.mes_cierre_ejercicio !== undefined && body.mes_cierre_ejercicio !== ""
        ? parseInt(String(body.mes_cierre_ejercicio))
        : null,
      banco: {
        nombre: body.banco?.nombre?.trim() || null,
        sucursal: body.banco?.sucursal?.trim() || null,
        tipo: body.banco?.tipo || null,
        cbu: body.banco?.cbu?.trim() || null,
        alias: body.banco?.alias?.trim() || null,
      },
      observacion: body.observacion?.trim() || null,
    };

    const res = await client.query(
      `
      UPDATE shared.tenants SET
        razon_social = $2,
        nombre_fantasia = $3,
        cuit = $4,
        cond_iva = $5::shared.cond_iva,
        inicio_actividad = $6::date,
        domicilio_fiscal = $7::jsonb,
        datos_fiscales = $8::jsonb,
        updated_at = NOW()
      WHERE ${condWhere}
      RETURNING id
      `,
      [
        id,
        body.razon_social.trim(),
        body.nombre_fantasia?.trim() || null,
        body.cuit.trim(),
        condIva,
        body.inicio_actividad || null,
        JSON.stringify(domicilio),
        JSON.stringify(datosFiscales),
      ]
    );
    if (res.rows.length === 0) return NextResponse.json({ error: "Fideicomiso no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[editar-fideicomiso] ERROR:", err.message);
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
