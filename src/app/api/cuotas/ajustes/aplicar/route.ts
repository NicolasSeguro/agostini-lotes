import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { query, getSchema } from "@/lib/db";

/**
 * POST /api/cuotas/ajustes/aplicar
 * Aplica un ajuste mensual. MODIFICA datos.
 */

type Body = {
  tenant: string;
  indice: string;
  periodo_aplicacion: string;
  coeficiente_aplicado?: number;
  porcentaje?: number;
  motivo_diferencia?: string | null;
  usuario?: string | null;
  notas?: string | null;
};

export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.CONTABILIDAD);
  if (!authz.ok) return authz.response;
  const session = authz.session;
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

    const ajusteRows = await query<{ aplicar_ajuste: string }>(
      `
      SELECT ${schema}.aplicar_ajuste(
        $1::shared.indice_tipo, $2::date, $3::numeric,
        $4::text, $5::uuid, $6::text
      ) AS aplicar_ajuste
      `,
      [
        body.indice,
        body.periodo_aplicacion,
        coeficiente,
        body.motivo_diferencia || null,
        session.userId || null,
        body.notas || null,
      ]
    );

    const ajusteId = ajusteRows[0]?.aplicar_ajuste;

    if (!ajusteId) {
      return NextResponse.json(
        { error: "La funcion no devolvio ID de la corrida" },
        { status: 500 }
      );
    }

    const corrida = await query(
      `SELECT * FROM ${schema}.ajustes_ejecuciones WHERE id = $1::uuid`,
      [ajusteId]
    );

    return NextResponse.json({ ok: true, ajuste_id: ajusteId, corrida: corrida[0] });
  } catch (err: any) {
    console.error("[ajustes/aplicar] ERROR:", err.message, err.detail);
    return NextResponse.json(
      { error: `Error al aplicar ajuste: ${err.message}`, sql_detail: err.detail || null },
      { status: 500 }
    );
  }
}