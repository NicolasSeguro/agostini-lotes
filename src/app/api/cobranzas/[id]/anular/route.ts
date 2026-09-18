import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireRole(ROLES.CAJA);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id: cobranzaId } = await params;

  let body: { tenant: string; reason: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) {
    return NextResponse.json({ error: "Fideicomiso inválido" }, { status: 400 });
  }
  if (!body.reason || body.reason.trim().length < 3) {
    return NextResponse.json(
      { error: "Tenés que ingresar un motivo de anulación" },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar que la cobranza exista, esté CONFIRMADA, sea del ERP (no legacy)
    // y esté dentro del mes
    const cobResult = await client.query(
      `
      SELECT id, fecha, estado, legacy_id
      FROM ${schema}.cobranzas
      WHERE id = $1::uuid
      `,
      [cobranzaId]
    );
    if (cobResult.rows.length === 0) {
      throw new Error("Cobranza no encontrada");
    }
    const cob = cobResult.rows[0];

    if (cob.estado === "ANULADA") {
      throw new Error("La cobranza ya está anulada");
    }
    if (cob.legacy_id !== null) {
      throw new Error(
        "Las cobranzas migradas del Access no se pueden anular desde el ERP. Anulalas en el Access."
      );
    }

    // Verificar que esté dentro del mes
    const hoy = new Date();
    const fechaCobr = new Date(cob.fecha);
    const mismoMes =
      hoy.getFullYear() === fechaCobr.getFullYear() &&
      hoy.getMonth() === fechaCobr.getMonth();
    if (!mismoMes) {
      throw new Error(
        "Solo se pueden anular cobranzas dentro del mismo mes. Esta es de otro mes, se debe hacer Nota de Crédito."
      );
    }

    // Cambiar estado a ANULADA
    await client.query(
      `
      UPDATE ${schema}.cobranzas
      SET estado = 'ANULADA'::tenant_template.cobranza_estado,
          anulled_at = NOW(),
          anulled_reason = $2
      WHERE id = $1::uuid
      `,
      [cobranzaId, body.reason]
    );

    // Reactivar cuotas que esta cobranza canceló
    const imputResult = await client.query(
      `SELECT cuota_id FROM ${schema}.cobranza_imputaciones WHERE cobranza_id = $1::uuid`,
      [cobranzaId]
    );

    for (const row of imputResult.rows) {
      // Determinar el nuevo estado de la cuota
      // Si la fecha de vencimiento ya pasó, MORA; sino EMITIDA
      await client.query(
        `
        UPDATE ${schema}.cuotas
        SET estado = CASE 
                       WHEN fecha_vto < CURRENT_DATE THEN 'MORA'::tenant_template.cuota_estado
                       ELSE 'EMITIDA'::tenant_template.cuota_estado
                     END,
            fecha_pago = NULL
        WHERE id = $1::uuid
        `,
        [row.cuota_id]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      cobranza_id: cobranzaId,
      cuotas_reactivadas: imputResult.rows.length,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error anulando cobranza:", err);
    return NextResponse.json(
      { error: err.message || "Error al anular cobranza" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
