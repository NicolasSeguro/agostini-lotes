import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const sp = req.nextUrl.searchParams;
  const tenant = sp.get("t") || "jacaranda";
  const schema = getSchema(tenant);

  if (!schema) {
    return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });
  }

  const rows = await query(
    `
    SELECT 
      id, nombre, nombre_abreviado,
      COALESCE((config->>'tope_desc_financiero_pct')::numeric, 0.10) AS tope_desc_financiero_pct
    FROM ${schema}.proyectos
    ORDER BY nombre
    `
  );

  return NextResponse.json({ results: rows });
}
