import { NextRequest, NextResponse } from "next/server";
import { requirePublicApiKey } from "@/lib/api-key";
import { getSchema, query, loadTenants } from "@/lib/db";
import { expirarReservasVencidas } from "@/lib/reservas-web";

export async function GET(req: NextRequest) {
  const denied = requirePublicApiKey(req);
  if (denied) return denied;

  const desarrollo = req.nextUrl.searchParams.get("desarrollo") || "";
  const includeAll = req.nextUrl.searchParams.get("include_all") === "1";
  await loadTenants();
  let schema: string;
  try {
    schema = getSchema(desarrollo);
  } catch {
    return NextResponse.json({ error: "desarrollo invalido" }, { status: 400 });
  }

  await expirarReservasVencidas(schema);

  const rows = await query(
    `
    SELECT
      l.id,
      l.estado::text AS estado,
      l.precio_lista AS precio,
      l.superficie_m2,
      l.numero,
      l.manzana,
      p.nombre AS proyecto
    FROM ${schema}.lotes l
    JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
    ${includeAll ? "" : "WHERE l.estado = 'DISPONIBLE'"}
    ORDER BY p.nombre, l.manzana, l.numero
    LIMIT 5000
    `
  );

  return NextResponse.json({
    desarrollo,
    disponibles: !includeAll,
    lotes: rows,
  });
}
