import { NextRequest, NextResponse } from "next/server";
import { query, getSchema } from "@/lib/db";

/**
 * GET /api/cuotas/ajustes/listar
 *
 * Lista corridas de ajuste con filtros opcionales y paginacion.
 *
 * Query params:
 *   - t        (obligatorio)  Tenant slug: alisos, jacaranda, tipuana, boulevard
 *   - indice   (opcional)     CAC | CVS | UVA | IPC | USD_OFICIAL
 *   - estado   (opcional)     EN_SIMULACION | EJECUTADA | REVERTIDA | CANCELADA
 *   - desde    (opcional)     YYYY-MM-DD (filtra periodo_aplicacion >= desde)
 *   - hasta    (opcional)     YYYY-MM-DD
 *   - limit    (opcional)     default 50, max 200
 *
 * Respuesta:
 *   { ok: true, total: N, items: [...] }
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const tenant = sp.get("t");
    const indice = sp.get("indice");
    const estado = sp.get("estado");
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const limit = Math.min(parseInt(sp.get("limit") || "50"), 200);

    if (!tenant) {
      return NextResponse.json({ error: "tenant (t) requerido" }, { status: 400 });
    }

    const schema = getSchema(tenant);
    const conditions: string[] = [];
    const params: any[] = [];

    if (indice) {
      params.push(indice);
      conditions.push(`indice = $${params.length}::shared.indice_tipo`);
    }
    if (estado) {
      params.push(estado);
      conditions.push(`estado = $${params.length}::tenant_template.ajuste_estado`);
    }
    if (desde) {
      params.push(desde);
      conditions.push(`periodo_aplicacion >= $${params.length}::date`);
    }
    if (hasta) {
      params.push(hasta);
      conditions.push(`periodo_aplicacion <= $${params.length}::date`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query(
      `
      SELECT
        id,
        indice,
        periodo_aplicacion,
        periodo_indice_usado,
        coeficiente_oficial,
        coeficiente_aplicado,
        motivo_diferencia,
        estado,
        cuotas_afectadas,
        contratos_afectados,
        monto_saldo_antes,
        monto_saldo_despues,
        ajuste_total_aplicado,
        creado_at,
        ejecutado_at,
        revertido_at,
        motivo_reversion,
        notas
      FROM ${schema}.ajustes_ejecuciones
      ${whereClause}
      ORDER BY periodo_aplicacion DESC, indice ASC, creado_at DESC
      LIMIT ${limit}
      `,
      params
    );

    return NextResponse.json({ ok: true, total: rows.length, items: rows });
  } catch (err: any) {
    console.error("[ajustes/listar] ERROR:", err.message, err.detail);
    return NextResponse.json(
      { error: `Error al listar ajustes: ${err.message}`, sql_detail: err.detail || null },
      { status: 500 }
    );
  }
}
