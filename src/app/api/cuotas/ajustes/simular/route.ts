import { NextRequest, NextResponse } from "next/server";
import { query, getSchema } from "@/lib/db";

/**
 * POST /api/cuotas/ajustes/simular
 * Simula sin modificar datos.
 */

type Body = {
  tenant: string;
  indice: string;
  periodo_aplicacion: string;
  coeficiente_aplicado?: number;
  porcentaje?: number;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!body.indice) return NextResponse.json({ error: "indice requerido" }, { status: 400 });
  if (!body.periodo_aplicacion || !/^\d{4}-\d{2}-\d{2}$/.test(body.periodo_aplicacion)) {
    return NextResponse.json(
      { error: "periodo_aplicacion invalido (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  let coeficiente: number;
  if (typeof body.coeficiente_aplicado === "number") {
    coeficiente = body.coeficiente_aplicado;
  } else if (typeof body.porcentaje === "number") {
    coeficiente = 1 + body.porcentaje / 100;
  } else {
    return NextResponse.json(
      { error: "Hay que especificar coeficiente_aplicado o porcentaje" },
      { status: 400 }
    );
  }

  if (coeficiente <= 0 || coeficiente > 2.0) {
    return NextResponse.json(
      { error: "coeficiente fuera de rango (>0 y <=2.0)" },
      { status: 400 }
    );
  }

  try {
    const schema = getSchema(body.tenant);
    const rows = await query(
      `
      SELECT * FROM ${schema}.simular_ajuste(
        $1::shared.indice_tipo, $2::date, $3::numeric
      )
      `,
      [body.indice, body.periodo_aplicacion, coeficiente]
    );

    return NextResponse.json({ ok: true, simulacion: rows[0] });
  } catch (err: any) {
    console.error("[ajustes/simular] ERROR:", err.message, err.detail);
    return NextResponse.json(
      { error: `Error al simular ajuste: ${err.message}`, sql_detail: err.detail || null },
      { status: 500 }
    );
  }
}