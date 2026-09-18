import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema } from "@/lib/db";
import * as XLSX from "xlsx";

/**
 * GET /api/lotes/exportar?t=tenant&proy=<id>&estado=<>&q=<>
 * Devuelve un .xlsx con los lotes filtrados.
 */
export async function GET(req: NextRequest) {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const sp = req.nextUrl.searchParams;
  const tenant = sp.get("t") || "jacaranda";
  const proyectoId = sp.get("proy") || null;
  const estado = sp.get("estado") || null;
  const search = (sp.get("q") || "").trim();

  const schema = getSchema(tenant);
  if (!schema) {
    return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });
  }

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (proyectoId) {
    conditions.push(`l.proyecto_id = $${idx++}`);
    params.push(proyectoId);
  }
  if (estado) {
    conditions.push(`l.estado::text = $${idx++}`);
    params.push(estado);
  }
  if (search) {
    conditions.push(`(l.numero ILIKE $${idx} OR l.manzana ILIKE $${idx} OR l.numero_padron ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT 
      l.id,
      p.nombre AS proyecto,
      l.manzana,
      l.numero,
      l.numero_padron,
      l.estado::text AS estado,
      l.superficie_m2,
      l.frente_ml,
      l.fondo_ml,
      l.zona,
      l.precio_lista,
      l.precio_x_m2,
      l.coeficiente,
      l.moneda,
      l.matricula,
      l.tiene_agua, l.tiene_luz, l.tiene_cloacas, l.tiene_gas,
      (SELECT 
        COALESCE(per.razon_social, TRIM(BOTH ', ' FROM COALESCE(per.apellido,'') || ', ' || COALESCE(per.nombre,'')))
       FROM ${schema}.ventas v
       JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id
       JOIN ${schema}.personas per ON per.id = vt.persona_id
       WHERE v.lote_id = l.id 
         AND v.estado::text NOT IN ('ANULADA','RECHAZADA_COMERCIAL','RECHAZADA_CONTABILIDAD')
       ORDER BY vt.orden LIMIT 1) AS comprador_actual
    FROM ${schema}.lotes l
    LEFT JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
    ${whereClause}
    ORDER BY p.nombre, l.manzana NULLS LAST, 
      NULLIF(REGEXP_REPLACE(l.numero, '[^0-9]', '', 'g'), '')::int NULLS LAST,
      l.numero
    `,
    params
  ) as any[];

  // Construir el dataset con tipos correctos para Excel
  const dataset = rows.map((r) => ({
    id: r.id,
    proyecto: r.proyecto || "",
    manzana: r.manzana || "",
    numero: r.numero || "",
    numero_padron: r.numero_padron || "",
    estado: r.estado || "",
    superficie_m2: r.superficie_m2 !== null ? Number(r.superficie_m2) : null,
    frente_ml: r.frente_ml !== null ? Number(r.frente_ml) : null,
    fondo_ml: r.fondo_ml !== null ? Number(r.fondo_ml) : null,
    zona: r.zona || "",
    precio_lista: r.precio_lista !== null ? Number(r.precio_lista) : null,
    precio_x_m2: r.precio_x_m2 !== null ? Number(r.precio_x_m2) : null,
    coeficiente: r.coeficiente !== null ? Number(r.coeficiente) : null,
    moneda: r.moneda || "ARS",
    matricula: r.matricula || "",
    tiene_agua: r.tiene_agua ? "SI" : "NO",
    tiene_luz: r.tiene_luz ? "SI" : "NO",
    tiene_cloacas: r.tiene_cloacas ? "SI" : "NO",
    tiene_gas: r.tiene_gas ? "SI" : "NO",
    comprador_actual: r.comprador_actual || "",
  }));

  // Crear workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(dataset, {
    header: [
      "id", "proyecto", "manzana", "numero", "numero_padron", "estado",
      "superficie_m2", "frente_ml", "fondo_ml", "zona",
      "precio_lista", "precio_x_m2", "coeficiente", "moneda",
      "matricula",
      "tiene_agua", "tiene_luz", "tiene_cloacas", "tiene_gas",
      "comprador_actual",
    ],
  });

  // Anchos de columna razonables
  ws["!cols"] = [
    { wch: 38 }, // id
    { wch: 20 }, // proyecto
    { wch: 8 },  // manzana
    { wch: 8 },  // numero
    { wch: 14 }, // numero_padron
    { wch: 14 }, // estado
    { wch: 13 }, // superficie_m2
    { wch: 10 }, // frente_ml
    { wch: 10 }, // fondo_ml
    { wch: 18 }, // zona
    { wch: 16 }, // precio_lista
    { wch: 14 }, // precio_x_m2
    { wch: 12 }, // coeficiente
    { wch: 8 },  // moneda
    { wch: 14 }, // matricula
    { wch: 7 }, { wch: 7 }, { wch: 9 }, { wch: 7 }, // servicios
    { wch: 30 }, // comprador
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Lotes");

  // Hoja "Instrucciones" para que el usuario sepa qué se puede modificar
  const instrucciones = [
    ["INSTRUCCIONES PARA IMPORTAR"],
    [""],
    ["1. NO modifiques la columna 'id'. Es la clave para identificar cada lote."],
    ["2. NO modifiques 'proyecto', 'manzana', 'numero', 'numero_padron', 'estado'."],
    ["   Estas columnas son informativas y no se actualizan al reimportar."],
    ["3. Al reimportar SOLO se aplicarán cambios sobre lotes en estado DISPONIBLE."],
    ["   Los lotes con otro estado serán omitidos y reportados en el preview."],
    ["4. Campos modificables:"],
    ["   - superficie_m2, frente_ml, fondo_ml"],
    ["   - zona"],
    ["   - precio_lista (el principal motivo de esta exportación)"],
    ["   - coeficiente, moneda (ARS/USD), matricula"],
    ["   - tiene_agua, tiene_luz, tiene_cloacas, tiene_gas (poné SI o NO)"],
    ["5. El campo 'precio_x_m2' se recalcula automáticamente a partir de precio_lista / superficie_m2."],
    ["6. NO borres filas, NO cambies el orden de las columnas, NO renombres las columnas."],
    ["7. Al reimportar verás un preview con los cambios antes de aplicarlos."],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrucciones);
  wsInstr["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instrucciones");

  // Generar buffer
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const fecha = new Date().toISOString().slice(0, 10);
  const proyParte = proyectoId ? `_proy` : "";
  const filename = `lotes_${tenant}${proyParte}_${fecha}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
