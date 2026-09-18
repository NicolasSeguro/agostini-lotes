import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema } from "@/lib/db";

/**
 * GET /api/boletos/listado
 * Filtros opcionales:
 *  - t (tenant)
 *  - q (búsqueda por nombre/CUIT/DNI titular)
 *  - desde, hasta (fecha YYYY-MM-DD - filtra por fecha_boleto o fecha_contabilizada)
 *  - proyecto_id
 *  - emitido: "si" / "no" / "" (todos)
 */
export async function GET(req: NextRequest) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  try {
    const sp = req.nextUrl.searchParams;
    const tenant = sp.get("t") || "jacaranda";
    const q = (sp.get("q") || "").trim();
    const desde = sp.get("desde") || "";
    const hasta = sp.get("hasta") || "";
    const proyectoId = sp.get("proyecto_id") || "";
    const emitido = sp.get("emitido") || "";

    const schema = getSchema(tenant);
    if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

    // Construcción de WHERE dinámico
    const conds: string[] = ["v.estado::text = 'CONTABILIZADA'"];
    const params: any[] = [];
    let idx = 1;

    if (q) {
      conds.push(`EXISTS (
        SELECT 1 FROM ${schema}.venta_titulares vt2
        JOIN ${schema}.personas p2 ON p2.id = vt2.persona_id
        WHERE vt2.venta_id = v.id AND vt2.fecha_baja IS NULL
          AND (
            UPPER(COALESCE(p2.apellido,'') || ' ' || COALESCE(p2.nombre,'') || ' ' || COALESCE(p2.razon_social,'')) LIKE UPPER($${idx})
            OR p2.cuit LIKE $${idx}
            OR p2.doc_numero LIKE $${idx}
          )
      )`);
      params.push(`%${q}%`);
      idx++;
    }

    if (desde) {
      conds.push(`COALESCE(v.fecha_boleto, v.fecha_contabilizada::date, v.fecha) >= $${idx}::date`);
      params.push(desde);
      idx++;
    }
    if (hasta) {
      conds.push(`COALESCE(v.fecha_boleto, v.fecha_contabilizada::date, v.fecha) <= $${idx}::date`);
      params.push(hasta);
      idx++;
    }
    if (proyectoId) {
      conds.push(`l.proyecto_id = $${idx}::uuid`);
      params.push(proyectoId);
      idx++;
    }

    if (emitido === "si") {
      conds.push(`EXISTS (SELECT 1 FROM ${schema}.boletos_emitidos be WHERE be.venta_id = v.id)`);
    } else if (emitido === "no") {
      conds.push(`NOT EXISTS (SELECT 1 FROM ${schema}.boletos_emitidos be WHERE be.venta_id = v.id)`);
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const rows = await query(
      `
      SELECT 
        v.id, v.nro, v.precio_total, v.anticipo, v.cant_cuotas,
        v.sistema_amort::text AS sistema_amort,
        v.indice_ajuste::text AS indice_ajuste,
        TO_CHAR(COALESCE(v.fecha_boleto, v.fecha_contabilizada::date, v.fecha), 'YYYY-MM-DD') AS fecha,
        l.id AS lote_id, l.numero AS lote_numero, l.manzana AS lote_manzana,
        p.id AS proyecto_id, p.nombre AS proyecto_nombre,
        (
          SELECT COALESCE(per.razon_social,
            TRIM(BOTH ', ' FROM COALESCE(per.apellido,'') || ', ' || COALESCE(per.nombre,'')))
          FROM ${schema}.venta_titulares vt
          JOIN ${schema}.personas per ON per.id = vt.persona_id
          WHERE vt.venta_id = v.id AND vt.fecha_baja IS NULL
          ORDER BY vt.orden
          LIMIT 1
        ) AS titular_principal,
        (SELECT COUNT(*) FROM ${schema}.venta_titulares vt 
         WHERE vt.venta_id = v.id AND vt.fecha_baja IS NULL)::int AS titulares_count,
        (SELECT COUNT(*) FROM ${schema}.boletos_emitidos be WHERE be.venta_id = v.id)::int AS emisiones_count,
        (SELECT MAX(generado_at) FROM ${schema}.boletos_emitidos be WHERE be.venta_id = v.id) AS ultima_emision
      FROM ${schema}.ventas v
      LEFT JOIN ${schema}.lotes l ON l.id = v.lote_id
      LEFT JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
      ${where}
      ORDER BY COALESCE(v.fecha_boleto, v.fecha_contabilizada::date, v.fecha) DESC, v.nro DESC
      LIMIT 500
      `,
      params
    ) as any[];

    return NextResponse.json({ ok: true, boletos: rows, total: rows.length });
  } catch (err: any) {
    console.error("[boletos/listado] ERROR:", err);
    return NextResponse.json({ 
      error: err.message || "Error al listar boletos",
      detail: err.detail || err.hint || null,
    }, { status: 500 });
  }
}
