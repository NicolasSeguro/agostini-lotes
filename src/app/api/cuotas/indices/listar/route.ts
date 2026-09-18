import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";


/**
 * GET /api/cuotas/indices/listar
 *
 * Lista valores de la tabla shared.indices_valores.
 *
 * Query params:
 *   - indice  (opcional)  CAC | CVS | UVA | IPC | USD_OFICIAL
 *   - desde   (opcional)  YYYY-MM-DD (filtra periodo >= desde)
 *   - hasta   (opcional)  YYYY-MM-DD (filtra periodo <= hasta)
 *   - limit   (opcional)  default 200, max 1000
 *
 * Respuesta:
 *   { ok: true, total: N, items: [...] }
 */
export async function GET(req: NextRequest) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  try {
    const sp = req.nextUrl.searchParams;
    const indice = sp.get("indice");
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const limit = Math.min(parseInt(sp.get("limit") || "200"), 1000);

    const conditions: string[] = [];
    const params: any[] = [];

    if (indice) {
      params.push(indice);
      conditions.push(`indice = $${params.length}::shared.indice_tipo`);
    }
    if (desde) {
      params.push(desde);
      conditions.push(`periodo >= $${params.length}::date`);
    }
    if (hasta) {
      params.push(hasta);
      conditions.push(`periodo <= $${params.length}::date`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<{
      id: string;
      indice: string;
      periodo: string;
      coeficiente: string;
      valor_acumulado: string | null;
      fuente: string | null;
      fecha_publicacion: string | null;
    }>(
      `
      SELECT
        id,
        indice,
        periodo,
        coeficiente,
        valor_acumulado,
        fuente,
        fecha_publicacion
      FROM shared.indices_valores
      ${whereClause}
      ORDER BY indice ASC, periodo DESC
      LIMIT ${limit}
      `,
      params
    );

    return NextResponse.json({ ok: true, total: rows.length, items: rows });
  } catch (err: any) {
    console.error("[indices/listar] ERROR:", err.message, err.detail);
    return NextResponse.json(
      { error: `Error al listar indices: ${err.message}`, sql_detail: err.detail || null },
      { status: 500 }
    );
  }
}
