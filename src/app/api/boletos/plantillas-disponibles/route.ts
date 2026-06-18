import { NextRequest, NextResponse } from "next/server";
import { query, getSchema } from "@/lib/db";

/**
 * GET /api/boletos/plantillas-disponibles?t=tenant&venta_id=...
 * Devuelve las plantillas del proyecto de la venta + sugerencia.
 * El proyecto de la venta se obtiene a travÃ©s del lote (la tabla ventas no tiene proyecto_id directo).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tenant = sp.get("t") || "jacaranda";
  const ventaId = sp.get("venta_id");
  if (!ventaId) return NextResponse.json({ error: "venta_id requerido" }, { status: 400 });

  const schema = getSchema(tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invÃ¡lido" }, { status: 400 });

  // Traer datos clave de la venta a travÃ©s del lote (proyecto estÃ¡ en lotes, no en ventas)
  const v = await query(
    `
    SELECT 
      v.id, v.anticipo, v.cant_cuotas, 
      v.sistema_amort::text AS sistema_amort,
      v.indice_ajuste::text AS indice_ajuste,
      l.proyecto_id, p.nombre AS proyecto_nombre
    FROM ${schema}.ventas v
    LEFT JOIN ${schema}.lotes l ON l.id = v.lote_id
    LEFT JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
    WHERE v.id = $1::uuid
    `,
    [ventaId]
  ) as any[];
  if (v.length === 0) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  const venta = v[0];

  if (!venta.proyecto_id) {
    return NextResponse.json({
      ok: false,
      error: "La venta no tiene proyecto asociado (lote sin proyecto)",
      plantillas: [],
    });
  }

  const cantCuotas = Number(venta.cant_cuotas) || 0;
  const anticipo = Number(venta.anticipo) || 0;
  const ajustable = venta.sistema_amort === "AJUSTABLE";
  const indice = venta.indice_ajuste || "NINGUNO";
  
  let modSugerida: string, anticSug: boolean, indSug: string;
  
  if (cantCuotas === 0) {
    modSugerida = "CONTADO"; anticSug = false; indSug = "NINGUNO";
  } else if (anticipo === 0) {
    if (ajustable) {
      modSugerida = "FINANCIADO"; anticSug = false;
      indSug = indice !== "NINGUNO" ? indice : "CAC";
    } else {
      modSugerida = "CUOTAS"; anticSug = false; indSug = "FIJO";
    }
  } else {
    modSugerida = "CUOTAS"; anticSug = true;
    indSug = ajustable ? (indice !== "NINGUNO" ? indice : "CAC") : "FIJO";
  }

  // Si AJUSTABLE pero el Ã­ndice es NINGUNO, aviso
  let aviso_indice: string | null = null;
  if (ajustable && indice === "NINGUNO") {
    aviso_indice = "La venta es AJUSTABLE pero no tiene Ã­ndice de ajuste cargado. EditÃ¡ la venta y cargÃ¡ el Ã­ndice antes de generar el boleto.";
  }

  // Traer todas las plantillas del proyecto
  const plantillas = await query(
    `
    SELECT id, modalidad, con_anticipo, indice, nombre, archivo_nombre
    FROM ${schema}.plantillas_boleto
    WHERE proyecto_id = $1::uuid AND activo = true
    ORDER BY modalidad, con_anticipo, indice
    `,
    [venta.proyecto_id]
  ) as any[];

  const con_marca = plantillas.map((p: any) => ({
    ...p,
    sugerida: p.modalidad === modSugerida && p.con_anticipo === anticSug && p.indice === indSug,
  }));

  return NextResponse.json({
    ok: true,
    plantillas: con_marca,
    proyecto_id: venta.proyecto_id,
    proyecto_nombre: venta.proyecto_nombre,
    sugerencia: { modalidad: modSugerida, con_anticipo: anticSug, indice: indSug },
    aviso_indice,
  });
}
