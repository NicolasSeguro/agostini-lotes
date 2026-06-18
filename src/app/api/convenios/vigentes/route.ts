import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * GET /api/convenios/vigentes?t=<tenant>
 *
 * Devuelve convenios activos, con fecha actual en su rango de vigencia,
 * y que apliquen al tenant indicado.
 *
 * Para el dropdown del form de venta.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tenant = sp.get("t") || "jacaranda";

  const rows = await query(
    `SELECT 
      id, razon_social, cuit,
      tipo_beneficio::text AS tipo_beneficio,
      valor_beneficio,
      fecha_inicio, fecha_fin
    FROM shared.convenios
    WHERE activo = true
      AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
      AND tenants_aplicables @> jsonb_build_array($1::text)
    ORDER BY razon_social ASC, fecha_inicio DESC`,
    [tenant]
  );

  return NextResponse.json({ convenios: rows });
}
