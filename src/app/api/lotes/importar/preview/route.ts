import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema } from "@/lib/db";
import * as XLSX from "xlsx";

// Campos que se pueden modificar al importar
const CAMPOS_EDITABLES = [
  "superficie_m2", "frente_ml", "fondo_ml",
  "zona", "precio_lista", "coeficiente", "moneda", "matricula",
  "tiene_agua", "tiene_luz", "tiene_cloacas", "tiene_gas",
] as const;

type CambioDetectado = {
  id: string;
  proyecto: string | null;
  manzana: string | null;
  numero: string;
  estado_actual: string;
  cambios: { campo: string; valor_viejo: any; valor_nuevo: any }[];
};

type Omitido = {
  fila: number;
  id: string | null;
  motivo: string;
  detalle?: string;
};

function parseBool(v: any): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (["SI", "SÍ", "TRUE", "1", "Y", "YES", "VERDADERO"].includes(s)) return true;
  if (["NO", "FALSE", "0", "N", "FALSO"].includes(s)) return false;
  return null;
}

function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(",", ".").replace(/[^\d.\-]/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function normalizeMoneda(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "ARS" || s === "USD") return s;
  return null;
}

function valoresIguales(a: any, b: any): boolean {
  // Comparación tolerante: null vs "" iguales, números con tolerancia 0.001
  if (a === null && (b === null || b === "" || b === undefined)) return true;
  if (b === null && (a === null || a === "" || a === undefined)) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.001;
  return String(a ?? "") === String(b ?? "");
}

export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.CONTABILIDAD);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  try {
    const formData = await req.formData();
    const tenant = String(formData.get("tenant") || "");
    const file = formData.get("file") as File | null;

    if (!tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

    const schema = getSchema(tenant);
    if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

    // Tamaño máximo razonable: 10 MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Archivo demasiado grande (máx 10 MB)" }, { status: 400 });
    }

    // Leer xlsx
    const buffer = Buffer.from(await file.arrayBuffer());
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: "buffer" });
    } catch (err: any) {
      return NextResponse.json({ error: "El archivo no es un Excel válido (.xlsx)" }, { status: 400 });
    }

    // Buscar la hoja "Lotes"
    const sheetName = wb.SheetNames.find(n => n.toLowerCase() === "lotes") || wb.SheetNames[0];
    if (!sheetName) return NextResponse.json({ error: "El archivo no tiene hojas" }, { status: 400 });

    const ws = wb.Sheets[sheetName];
    const filas: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });

    if (filas.length === 0) {
      return NextResponse.json({ error: "La hoja está vacía" }, { status: 400 });
    }

    // Validar headers esperados
    const primeraFila = filas[0];
    if (!("id" in primeraFila)) {
      return NextResponse.json({
        error: "Falta la columna 'id'. Usá un archivo exportado por el sistema."
      }, { status: 400 });
    }

    // Recolectar todos los ids del Excel
    const idsExcel = filas.map(f => f.id).filter(Boolean);
    if (idsExcel.length === 0) {
      return NextResponse.json({ error: "Ninguna fila tiene id válido" }, { status: 400 });
    }

    // Traer todos los lotes referenciados de la BD en una sola query
    const lotesBd = await query(
      `
      SELECT l.id, p.nombre AS proyecto, l.manzana, l.numero, l.estado::text AS estado,
        l.superficie_m2, l.frente_ml, l.fondo_ml, l.zona,
        l.precio_lista, l.coeficiente, l.moneda, l.matricula,
        l.tiene_agua, l.tiene_luz, l.tiene_cloacas, l.tiene_gas
      FROM ${schema}.lotes l
      LEFT JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
      WHERE l.id = ANY($1::uuid[])
      `,
      [idsExcel]
    ) as any[];

    const bdMap = new Map<string, any>(lotesBd.map((l: any) => [l.id, l]));

    const cambios: CambioDetectado[] = [];
    const omitidos: Omitido[] = [];
    const errores: { fila: number; mensaje: string }[] = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const numFila = i + 2; // 1=header, 2=primera de datos

      const id = String(fila.id || "").trim();
      if (!id) {
        errores.push({ fila: numFila, mensaje: "Fila sin id" });
        continue;
      }

      const lote = bdMap.get(id);
      if (!lote) {
        omitidos.push({ fila: numFila, id, motivo: "no_existe", detalle: "El id no existe en la base" });
        continue;
      }

      if (lote.estado !== "DISPONIBLE") {
        omitidos.push({
          fila: numFila, id, motivo: "estado",
          detalle: `Estado actual: ${lote.estado}. Solo se actualizan lotes DISPONIBLE.`
        });
        continue;
      }

      // Parsear valores nuevos del Excel
      const nuevos: any = {
        superficie_m2: parseNum(fila.superficie_m2),
        frente_ml: parseNum(fila.frente_ml),
        fondo_ml: parseNum(fila.fondo_ml),
        zona: fila.zona !== null && fila.zona !== undefined ? String(fila.zona).trim() || null : null,
        precio_lista: parseNum(fila.precio_lista),
        coeficiente: parseNum(fila.coeficiente),
        moneda: normalizeMoneda(fila.moneda),
        matricula: fila.matricula !== null && fila.matricula !== undefined ? String(fila.matricula).trim() || null : null,
        tiene_agua: parseBool(fila.tiene_agua),
        tiene_luz: parseBool(fila.tiene_luz),
        tiene_cloacas: parseBool(fila.tiene_cloacas),
        tiene_gas: parseBool(fila.tiene_gas),
      };

      // Validar moneda
      if (fila.moneda && nuevos.moneda === null) {
        errores.push({ fila: numFila, mensaje: `Moneda inválida: "${fila.moneda}". Usá ARS o USD.` });
        continue;
      }
      // Validar booleanos
      for (const k of ["tiene_agua", "tiene_luz", "tiene_cloacas", "tiene_gas"]) {
        if (fila[k] !== null && fila[k] !== undefined && fila[k] !== "" && nuevos[k] === null) {
          errores.push({ fila: numFila, mensaje: `Valor inválido en ${k}: "${fila[k]}". Usá SI o NO.` });
        }
      }

      // Detectar cambios reales
      const cambiosFila: { campo: string; valor_viejo: any; valor_nuevo: any }[] = [];
      for (const campo of CAMPOS_EDITABLES) {
        const viejo = lote[campo];
        const nuevo = nuevos[campo];
        // Si el Excel tiene null/vacío en un campo, lo interpretamos como "no cambiar"
        // (para evitar borrar accidentalmente valores existentes)
        if (nuevo === null) continue;
        // Convertir números de BD (suelen venir como strings)
        const viejoNorm = typeof viejo === "string" && !isNaN(parseFloat(viejo)) && campo !== "moneda" && campo !== "matricula" && campo !== "zona"
          ? parseFloat(viejo)
          : viejo;
        if (!valoresIguales(viejoNorm, nuevo)) {
          cambiosFila.push({ campo, valor_viejo: viejoNorm, valor_nuevo: nuevo });
        }
      }

      if (cambiosFila.length > 0) {
        cambios.push({
          id: lote.id,
          proyecto: lote.proyecto,
          manzana: lote.manzana,
          numero: lote.numero,
          estado_actual: lote.estado,
          cambios: cambiosFila,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total_filas: filas.length,
      cambios,
      omitidos,
      errores,
      resumen: {
        con_cambios: cambios.length,
        omitidos: omitidos.length,
        errores: errores.length,
        sin_cambios: filas.length - cambios.length - omitidos.length - errores.length,
      },
    });
  } catch (err: any) {
    console.error("[importar/preview] ERROR:", err);
    return NextResponse.json({ error: err.message || "Error al procesar el archivo" }, { status: 500 });
  }
}
