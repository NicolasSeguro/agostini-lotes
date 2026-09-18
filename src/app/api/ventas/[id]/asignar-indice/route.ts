import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial } from "@/lib/workflow-helpers";

const INDICES_VALIDOS = ["CAC", "CVS", "UVA", "IPC", "USD_OFICIAL"];

type Body = {
  tenant: string;
  indice_ajuste: string;
  usuario?: string;
};

/**
 * POST /api/ventas/[id]/asignar-indice
 *
 * Asigna un indice de ajuste a una venta que actualmente tiene NINGUNO.
 * No modifica cuotas existentes ni recalcula montos: solo agrega el indice
 * para que las proximas corridas de ajuste lo tomen en cuenta.
 *
 * Reglas:
 *   - Solo permite asignar si la venta tiene indice_ajuste = NINGUNO (no permite cambiar).
 *   - El nuevo indice debe ser uno valido: CAC, CVS, UVA, IPC, USD_OFICIAL.
 *   - No permite asignar en ventas ANULADA, RECHAZADA_AUTORIZACION o RECHAZADA_CONTABILIDAD.
 *   - Registra en venta_historial para auditoria.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.CONTABILIDAD);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;
  let body: Body;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  // Validaciones de input
  if (!body.tenant) {
    return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "UUID de venta invalido" }, { status: 400 });
  }
  if (!body.indice_ajuste || !INDICES_VALIDOS.includes(body.indice_ajuste)) {
    return NextResponse.json(
      { error: `indice_ajuste invalido. Valores permitidos: ${INDICES_VALIDOS.join(", ")}` },
      { status: 400 }
    );
  }

  const schema = getSchema(body.tenant);
  if (!schema) {
    return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });
  }

  const usuario = sessionLabel(session);
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lockear la venta y validar estado actual
    const ventaRes = await client.query(
      `SELECT id, estado::text AS estado, indice_ajuste::text AS indice_actual, sistema_amort::text AS sistema_amort
       FROM ${schema}.ventas
       WHERE id = $1::uuid
       FOR UPDATE`,
      [id]
    );

    if (ventaRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }

    const venta = ventaRes.rows[0];
    const estadosBloqueados = ["ANULADA", "RECHAZADA_AUTORIZACION", "RECHAZADA_CONTABILIDAD"];

    if (estadosBloqueados.includes(venta.estado)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `No se puede asignar indice a una venta en estado ${venta.estado}` },
        { status: 409 }
      );
    }

    // Proteccion clave: solo asignar si actualmente esta en NINGUNO.
    // Para cambiar un indice ya asignado se requeriria un flujo distinto que no es soportado por ahora.
    if (venta.indice_actual !== "NINGUNO") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: `Esta venta ya tiene indice asignado: ${venta.indice_actual}. ` +
                 `Cambiar el indice de una venta con indice asignado no esta soportado.`,
        },
        { status: 409 }
      );
    }

    // UPDATE simple: solo el indice. No tocar nada mas.
    await client.query(
      `UPDATE ${schema}.ventas
       SET indice_ajuste = $1::shared.indice_tipo
       WHERE id = $2::uuid`,
      [body.indice_ajuste, id]
    );

    // Auditoria: registrar en venta_historial. El estado no cambia, lo dejamos igual.
    await registrarHistorial(
      client,
      schema,
      id,
      venta.estado,
      venta.estado,
      `Asignacion retroactiva de indice: NINGUNO -> ${body.indice_ajuste}`,
      usuario,
      {
        accion: "asignar_indice",
        indice_anterior: "NINGUNO",
        indice_nuevo: body.indice_ajuste,
        sistema_amort: venta.sistema_amort,
      }
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      venta_id: id,
      indice_anterior: "NINGUNO",
      indice_nuevo: body.indice_ajuste,
      mensaje: `Indice ${body.indice_ajuste} asignado correctamente. Las cuotas existentes mantienen su monto. Los proximos ajustes de ${body.indice_ajuste} las van a tomar.`,
    });
  } catch (err: any) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[asignar-indice] ERROR:", err.message, err.detail);
    return NextResponse.json(
      { error: `Error al asignar indice: ${err.message}`, sql_detail: err.detail || null },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
