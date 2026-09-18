import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema } from "@/lib/db";

/**
 * GET /api/cuotas/ajustes/detalle/[id]?t=alisos&page=1&pageSize=50
 *
 * Devuelve:
 *   - header: encabezado de la corrida (ajustes_ejecuciones)
 *   - proyectos_disponibles: lista de {id, codigo, nombre} (para popular dropdown)
 *   - estados_disponibles: lista de estados distintos de cuota (para popular dropdown)
 *   - detalle: cuotas afectadas paginadas (vacio si no se aplica ningun filtro)
 *   - total_detalle: total de cuotas que matchean los filtros
 *
 * Filtros opcionales:
 *   - proyecto_id: UUID del proyecto
 *   - venta_nro: numero exacto de venta (string)
 *   - cuota_estado: estado del enum (PENDIENTE, EMITIDA, etc.)
 *   - vencimiento: 'vencida' (fecha_vto < hoy) | 'al_dia' (fecha_vto >= hoy)
 *
 * Comportamiento: si no se aplica NINGUN filtro, detalle viene vacio y
 * total_detalle = 0 (para evitar cargar miles de filas innecesariamente).
 * Igual se devuelve proyectos_disponibles y estados_disponibles calculados
 * sobre el universo completo de la corrida.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  try {
    const sp = req.nextUrl.searchParams;
    const tenant = sp.get("t");
    const ajusteId = params.id;
    const page = Math.max(parseInt(sp.get("page") || "1"), 1);
    const pageSize = Math.min(parseInt(sp.get("pageSize") || "50"), 500);
    const offset = (page - 1) * pageSize;

    // Filtros opcionales
    const proyectoId = sp.get("proyecto_id");
    const ventaNro = sp.get("venta_nro");
    const cuotaEstado = sp.get("cuota_estado");
    const vencimiento = sp.get("vencimiento"); // 'vencida' | 'al_dia' | null

    if (!tenant) {
      return NextResponse.json({ error: "tenant (t) requerido" }, { status: 400 });
    }
    if (!ajusteId || !/^[0-9a-f-]{36}$/i.test(ajusteId)) {
      return NextResponse.json({ error: "UUID invalido" }, { status: 400 });
    }
    if (proyectoId && !/^[0-9a-f-]{36}$/i.test(proyectoId)) {
      return NextResponse.json({ error: "proyecto_id UUID invalido" }, { status: 400 });
    }

    const schema = getSchema(tenant);

    // 1. Encabezado
    const headerRows = await query(
      `SELECT * FROM ${schema}.ajustes_ejecuciones WHERE id = $1::uuid`,
      [ajusteId]
    );

    if (headerRows.length === 0) {
      return NextResponse.json({ error: "Corrida no encontrada" }, { status: 404 });
    }

    // 2. Proyectos disponibles en esta corrida (para popular dropdown)
    const proyectosDisponibles = await query(
      `
      SELECT DISTINCT p.id, p.codigo, p.nombre_abreviado AS nombre
      FROM ${schema}.ajustes_detalle d
      INNER JOIN ${schema}.cuotas c ON c.id = d.cuota_id
      INNER JOIN ${schema}.ventas v ON v.id = c.venta_id
      INNER JOIN ${schema}.lotes l ON l.id = v.lote_id
      INNER JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
      WHERE d.ajuste_id = $1::uuid
      ORDER BY p.codigo ASC
      `,
      [ajusteId]
    );

    // 3. Estados de cuota distintos en esta corrida (para popular dropdown)
    const estadosRows = await query<{ estado: string }>(
      `
      SELECT DISTINCT c.estado::text AS estado
      FROM ${schema}.ajustes_detalle d
      INNER JOIN ${schema}.cuotas c ON c.id = d.cuota_id
      WHERE d.ajuste_id = $1::uuid
      ORDER BY c.estado::text ASC
      `,
      [ajusteId]
    );
    const estadosDisponibles = estadosRows.map((r) => r.estado);

    // 4. Si no hay filtros, no traer detalle (evita carga innecesaria de miles de filas)
    const hayFiltro = !!(proyectoId || ventaNro || cuotaEstado || vencimiento);

    if (!hayFiltro) {
      return NextResponse.json({
        ok: true,
        header: headerRows[0],
        proyectos_disponibles: proyectosDisponibles,
        estados_disponibles: estadosDisponibles,
        detalle: [],
        total_detalle: 0,
        page: 1,
        pageSize,
        sin_filtros: true,
      });
    }

    // 5. Construir clausulas WHERE dinamicas
    const wheres: string[] = ["d.ajuste_id = $1::uuid"];
    const args: any[] = [ajusteId];

    if (proyectoId) {
      args.push(proyectoId);
      wheres.push(`p.id = $${args.length}::uuid`);
    }
    if (ventaNro) {
      args.push(ventaNro);
      wheres.push(`v.nro = $${args.length}`);
    }
    if (cuotaEstado) {
      args.push(cuotaEstado);
      wheres.push(`c.estado::text = $${args.length}`);
    }
    if (vencimiento === "vencida") {
      wheres.push(`c.fecha_vto < CURRENT_DATE`);
    } else if (vencimiento === "al_dia") {
      wheres.push(`c.fecha_vto >= CURRENT_DATE`);
    }

    const whereSQL = wheres.join(" AND ");

    // 6. COUNT con los mismos filtros
    const totalRows = await query<{ total: string }>(
      `
      SELECT COUNT(*)::text AS total
      FROM ${schema}.ajustes_detalle d
      INNER JOIN ${schema}.cuotas c ON c.id = d.cuota_id
      INNER JOIN ${schema}.ventas v ON v.id = c.venta_id
      INNER JOIN ${schema}.lotes l ON l.id = v.lote_id
      INNER JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
      WHERE ${whereSQL}
      `,
      args
    );
    const totalDetalle = parseInt(totalRows[0]?.total || "0");

    // 7. Detalle paginado con los filtros
    const detalleRows = await query(
      `
      SELECT
        d.id, d.cuota_id,
        d.monto_total_antes, d.monto_pagado_antes, d.saldo_antes,
        d.ajuste_acumulado_antes, d.indice_factor_actual_antes, d.indice_periodo_base_antes,
        d.ajuste_aplicado,
        d.monto_total_despues, d.ajuste_acumulado_despues, d.indice_factor_actual_despues,
        c.numero AS cuota_numero, c.fecha_vto, c.estado AS cuota_estado,
        v.nro AS venta_nro, v.id AS venta_id,
        p.codigo AS proyecto_codigo, p.nombre_abreviado AS proyecto_nombre
      FROM ${schema}.ajustes_detalle d
      INNER JOIN ${schema}.cuotas c ON c.id = d.cuota_id
      INNER JOIN ${schema}.ventas v ON v.id = c.venta_id
      INNER JOIN ${schema}.lotes l ON l.id = v.lote_id
      INNER JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
      WHERE ${whereSQL}
      ORDER BY p.codigo ASC, v.nro ASC, c.numero ASC
      LIMIT ${pageSize} OFFSET ${offset}
      `,
      args
    );

    return NextResponse.json({
      ok: true,
      header: headerRows[0],
      proyectos_disponibles: proyectosDisponibles,
      estados_disponibles: estadosDisponibles,
      detalle: detalleRows,
      total_detalle: totalDetalle,
      page,
      pageSize,
      sin_filtros: false,
    });
  } catch (err: any) {
    console.error("[ajustes/detalle] ERROR:", err.message, err.detail);
    return NextResponse.json(
      { error: `Error al obtener detalle: ${err.message}`, sql_detail: err.detail || null },
      { status: 500 }
    );
  }
}
