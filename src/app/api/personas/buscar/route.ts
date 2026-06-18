import { NextRequest, NextResponse } from "next/server";
import { query, getSchema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tenant = sp.get("t") || "jacaranda";
  const search = sp.get("q") || "";
  const soloDeudoras = sp.get("deudoras") === "1";
  const soloAlDia = sp.get("al_dia") === "1";
  const includeEstado = sp.get("include_estado") === "1";

  if (search.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const schema = getSchema(tenant);

  const conditions: string[] = [
    `(
      UPPER(COALESCE(p.apellido,'')) LIKE UPPER($1) OR
      UPPER(COALESCE(p.nombre,'')) LIKE UPPER($1) OR
      UPPER(COALESCE(p.razon_social,'')) LIKE UPPER($1) OR
      REPLACE(COALESCE(p.cuit,''), '-', '') LIKE REPLACE($1, '-', '') OR
      UPPER(COALESCE(p.doc_numero,'')) LIKE UPPER($1)
    )`,
  ];

  if (soloDeudoras) {
    conditions.push(`EXISTS (
      SELECT 1 FROM ${schema}.venta_titulares vt
      JOIN ${schema}.cuotas c ON c.venta_id = vt.venta_id
      WHERE vt.persona_id = p.id
        AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
    )`);
  }
  
  if (soloAlDia) {
    // Solo personas que NO tengan cuotas vigentes (vencidas o del mes corriente)
    // pero SI tengan cuotas futuras para adelantar
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM ${schema}.venta_titulares vt
      JOIN ${schema}.cuotas c ON c.venta_id = vt.venta_id
      WHERE vt.persona_id = p.id
        AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
        AND (c.fecha_vto < CURRENT_DATE
             OR (EXTRACT(YEAR FROM c.fecha_vto) = EXTRACT(YEAR FROM CURRENT_DATE)
                 AND EXTRACT(MONTH FROM c.fecha_vto) = EXTRACT(MONTH FROM CURRENT_DATE)))
    )`);
    // Y que tenga al menos una cuota futura
    conditions.push(`EXISTS (
      SELECT 1 FROM ${schema}.venta_titulares vt
      JOIN ${schema}.cuotas c ON c.venta_id = vt.venta_id
      WHERE vt.persona_id = p.id
        AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
    )`);
  }

  // Si pidieron include_estado, agregamos columna tiene_vigentes
  const extraSelect = includeEstado ? `,
      EXISTS (
        SELECT 1 FROM ${schema}.venta_titulares vt3
        JOIN ${schema}.cuotas c3 ON c3.venta_id = vt3.venta_id
        WHERE vt3.persona_id = p.id
          AND c3.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
          AND (c3.fecha_vto < CURRENT_DATE
               OR (EXTRACT(YEAR FROM c3.fecha_vto) = EXTRACT(YEAR FROM CURRENT_DATE)
                   AND EXTRACT(MONTH FROM c3.fecha_vto) = EXTRACT(MONTH FROM CURRENT_DATE)))
      ) AS tiene_vigentes` : "";

  const rows = await query(
    `
    SELECT 
      p.id,
      COALESCE(p.razon_social,
        TRIM(BOTH ', ' FROM COALESCE(p.apellido,'') || ', ' || COALESCE(p.nombre,''))
      ) AS nombre,
      p.cuit, p.doc_numero,
      (
        SELECT COUNT(*) FROM ${schema}.venta_titulares vt2
        JOIN ${schema}.cuotas c2 ON c2.venta_id = vt2.venta_id
        WHERE vt2.persona_id = p.id
          AND c2.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
      )::int AS cuotas_pendientes
      ${extraSelect}
    FROM ${schema}.personas p
    WHERE ${conditions.join(" AND ")}
    ORDER BY COALESCE(p.apellido, p.razon_social) NULLS LAST, p.nombre
    LIMIT 20
    `,
    [`%${search}%`]
  );

  return NextResponse.json({ results: rows });
}
