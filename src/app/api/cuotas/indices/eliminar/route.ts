import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getPool, TENANTS } from "@/lib/db";

/**
 * POST /api/cuotas/indices/eliminar
 *
 * Elimina un valor de indice. Verifica antes que ninguna corrida EJECUTADA
 * de cualquier tenant haya usado ese (indice, periodo).
 *
 * Body JSON:
 *   { indice: "CAC", periodo: "2026-06-01" }
 *
 * Respuesta exito:
 *   { ok: true, mensaje: "Eliminado" }
 *
 * Respuesta error (esta en uso):
 *   { error: "No se puede eliminar...", corridas_que_lo_usan: [...] }, status 409
 */

type Body = {
  indice: string;
  periodo: string;
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

  if (!body.indice) return NextResponse.json({ error: "indice requerido" }, { status: 400 });
  if (!body.periodo || !/^\d{4}-\d{2}-\d{2}$/.test(body.periodo)) {
    return NextResponse.json({ error: "periodo invalido (YYYY-MM-DD)" }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar que exista
    const existente = await client.query(
      `SELECT id FROM shared.indices_valores WHERE indice = $1::shared.indice_tipo AND periodo = $2::date`,
      [body.indice, body.periodo]
    );
    if (existente.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "El valor no existe" }, { status: 404 });
    }

    // Verificar que NO este usado por ninguna corrida EJECUTADA en ningun tenant
    const corridasEnUso: any[] = [];
    for (const tenant of TENANTS) {
      const res = await client.query(
        `
        SELECT id, indice, periodo_aplicacion, estado, cuotas_afectadas
        FROM ${tenant.schema}.ajustes_ejecuciones
        WHERE indice = $1::shared.indice_tipo
          AND periodo_indice_usado = $2::date
          AND estado = 'EJECUTADA'
        `,
        [body.indice, body.periodo]
      );
      for (const r of res.rows) {
        corridasEnUso.push({ ...r, tenant: tenant.slug });
      }
    }

    if (corridasEnUso.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: "No se puede eliminar: hay corridas EJECUTADAS que usan este valor. Hay que revertirlas primero.",
          corridas_que_lo_usan: corridasEnUso,
        },
        { status: 409 }
      );
    }

    // Eliminar
    await client.query(
      `DELETE FROM shared.indices_valores WHERE indice = $1::shared.indice_tipo AND periodo = $2::date`,
      [body.indice, body.periodo]
    );

    // Recalcular acumulados posteriores
    await recalcularAcumuladosPosteriores(client, body.indice, body.periodo);

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, mensaje: "Valor eliminado" });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("[indices/eliminar] ERROR:", err.message, err.detail);
    return NextResponse.json(
      { error: `Error al eliminar indice: ${err.message}`, sql_detail: err.detail || null },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

async function recalcularAcumuladosPosteriores(
  client: any,
  indice: string,
  desdePeriodo: string
): Promise<void> {
  const posteriores = await client.query(
    `
    SELECT id, periodo, coeficiente
    FROM shared.indices_valores
    WHERE indice = $1::shared.indice_tipo AND periodo > $2::date
    ORDER BY periodo ASC
    `,
    [indice, desdePeriodo]
  );

  if (posteriores.rows.length === 0) return;

  const ancla = await client.query(
    `
    SELECT valor_acumulado
    FROM shared.indices_valores
    WHERE indice = $1::shared.indice_tipo AND periodo < $2::date
    ORDER BY periodo DESC
    LIMIT 1
    `,
    [indice, desdePeriodo]
  );

  let acumulado = ancla.rows.length > 0 ? parseFloat(ancla.rows[0].valor_acumulado) : 1.0;

  for (const row of posteriores.rows) {
    acumulado = acumulado * parseFloat(row.coeficiente);
    await client.query(
      `UPDATE shared.indices_valores SET valor_acumulado = $1 WHERE id = $2`,
      [acumulado, row.id]
    );
  }
}