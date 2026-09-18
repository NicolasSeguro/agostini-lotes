import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const sp = req.nextUrl.searchParams;
  const tenant = sp.get("t") || "jacaranda";
  const search = sp.get("q") || "";
  const schema = getSchema(tenant);

  if (!schema) {
    return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });
  }
  if (search.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const rows = await query(
    `
    SELECT 
      p.id,
      COALESCE(p.razon_social,
        TRIM(BOTH ', ' FROM COALESCE(p.apellido,'') || ', ' || COALESCE(p.nombre,''))
      ) AS nombre,
      p.cuit, p.doc_numero, p.doc_tipo, p.tipo, p.cond_iva,
      p.email, p.telefono
    FROM ${schema}.personas p
    WHERE p.activo = true
      AND p.deleted_at IS NULL
      AND (
        UPPER(COALESCE(p.apellido,'')) LIKE UPPER($1) OR
        UPPER(COALESCE(p.nombre,'')) LIKE UPPER($1) OR
        UPPER(COALESCE(p.razon_social,'')) LIKE UPPER($1) OR
        REPLACE(COALESCE(p.cuit,''), '-', '') LIKE REPLACE($1, '-', '') OR
        UPPER(COALESCE(p.doc_numero,'')) LIKE UPPER($1)
      )
    ORDER BY COALESCE(p.apellido, p.razon_social) NULLS LAST, p.nombre
    LIMIT 20
    `,
    [`%${search}%`]
  );

  return NextResponse.json({ results: rows });
}
