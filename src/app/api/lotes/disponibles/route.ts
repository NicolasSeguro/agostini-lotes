import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const sp = req.nextUrl.searchParams;
  const tenant = sp.get("t") || "jacaranda";
  const proyectoId = sp.get("proyecto");
  const search = sp.get("q") || "";
  const schema = getSchema(tenant);

  if (!schema) {
    return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });
  }
  if (!proyectoId) {
    return NextResponse.json({ error: "proyecto requerido" }, { status: 400 });
  }

  const params: any[] = [proyectoId];
  let extraCondition = "";
  if (search.length >= 1) {
    params.push(`%${search}%`);
    extraCondition = `AND (
      UPPER(COALESCE(numero, '')) LIKE UPPER($2) OR
      UPPER(COALESCE(manzana, '')) LIKE UPPER($2) OR
      UPPER(COALESCE(numero_padron, '')) LIKE UPPER($2)
    )`;
  }

  const rows = await query(
    `
    SELECT 
      id, numero, manzana, numero_padron,
      superficie_m2, frente_ml, fondo_ml,
      precio_lista, precio_x_m2, moneda
    FROM ${schema}.lotes
    WHERE proyecto_id = $1
      AND estado = 'DISPONIBLE'::tenant_template.lote_estado
      ${extraCondition}
    ORDER BY 
      COALESCE(manzana, ''),
      LENGTH(COALESCE(numero, '')),
      COALESCE(numero, '')
    LIMIT 5000
    `,
    params
  );

  return NextResponse.json({ results: rows });
}
