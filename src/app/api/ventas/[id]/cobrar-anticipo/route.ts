import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import {
  registrarHistorial,
  totalAnticipoCobrado,
  getVentaParaTransicion,
} from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
  monto: number;
  medio_pago: string;
  banco_origen?: string | null;
  numero_operacion?: string | null;
  fecha?: string; // YYYY-MM-DD, default hoy
  observaciones?: string | null;
};

/**
 * POST /api/ventas/[id]/cobrar-anticipo
 * 
 * Genera una cobranza de anticipo en estado BORRADOR.
 * Se puede llamar mÃºltiples veces para cobrar el anticipo en cuotas.
 * 
 * Si la suma de anticipos cobrados alcanza el monto del anticipo de la venta,
 * la venta pasa de CERRADA_PENDIENTE â†’ CERRADA_CONFIRMADA automÃ¡ticamente.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await requireRole(ROLES.CAJA);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  const { id } = await ctx.params;
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!body.monto || body.monto <= 0) {
    return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });
  }
  if (!body.medio_pago) {
    return NextResponse.json({ error: "Medio de pago requerido" }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Validar venta en CERRADA_PENDIENTE
    const venta = await getVentaParaTransicion(client, schema, id, ["CERRADA_PENDIENTE"]);
    const anticipoEsperado = parseFloat(venta.anticipo || 0);

    if (anticipoEsperado <= 0) {
      throw new Error("Esta venta no tiene anticipo definido");
    }

    // 2) Validar que no se exceda el anticipo
    const yaCobrado = await totalAnticipoCobrado(client, schema, id);
    const restante = anticipoEsperado - yaCobrado;
    
    if (restante <= 0) {
      throw new Error(`El anticipo ya estÃ¡ totalmente cobrado ($${anticipoEsperado.toLocaleString("es-AR")})`);
    }
    if (body.monto > restante + 0.01) {
      throw new Error(
        `El monto ($${body.monto.toLocaleString("es-AR")}) excede el anticipo restante ($${restante.toLocaleString("es-AR")})`
      );
    }

    // 3) Obtener el primer titular como persona_id de la cobranza
    const titularRes = await client.query(
      `SELECT persona_id FROM ${schema}.venta_titulares WHERE venta_id = $1::uuid ORDER BY orden LIMIT 1`,
      [id]
    );
    if (titularRes.rows.length === 0) {
      throw new Error("La venta no tiene titulares");
    }
    const personaId = titularRes.rows[0].persona_id;

    // 4) Insertar cobranza en BORRADOR (recibo provisorio)
    const fechaCobro = body.fecha || new Date().toISOString().slice(0, 10);
    const cobranzaRes = await client.query(
      `
      INSERT INTO ${schema}.cobranzas
        (fecha, persona_id, monto_total, moneda, medio_pago,
         banco_origen, numero_operacion, estado, venta_id, es_anticipo_venta,
         observaciones)
      VALUES
        ($1::date, $2::uuid, $3, 'ARS', $4::tenant_template.medio_pago,
         $5, $6, 'BORRADOR'::tenant_template.cobranza_estado, $7::uuid, true,
         $8)
      RETURNING id, nro_recibo
      `,
      [
        fechaCobro,
        personaId,
        body.monto,
        body.medio_pago,
        body.banco_origen || null,
        body.numero_operacion || null,
        id,
        body.observaciones || `Anticipo de venta ${venta.nro || ""}`.trim(),
      ]
    );
    const cobranzaId = cobranzaRes.rows[0].id;
    const nroRecibo = cobranzaRes.rows[0].nro_recibo;

    // 5) Si el anticipo estÃ¡ completo, pasar la venta a CERRADA_CONFIRMADA
    const totalAhora = yaCobrado + body.monto;
    let nuevoEstado: string | null = null;
    
    if (Math.abs(totalAhora - anticipoEsperado) < 0.01) {
      // Anticipo completo
      await client.query(
        `UPDATE ${schema}.ventas 
         SET estado = 'CERRADA_CONFIRMADA'::tenant_template.venta_estado,
             fecha_cerrada_confirmada = NOW(),
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [id]
      );
      
      await registrarHistorial(
        client, schema, id,
        "CERRADA_PENDIENTE", "CERRADA_CONFIRMADA",
        `Anticipo cobrado en su totalidad ($${anticipoEsperado.toLocaleString("es-AR")})`, sessionLabel(session),
        { monto_anticipo: anticipoEsperado, cant_cobranzas: -1 }
      );
      nuevoEstado = "CERRADA_CONFIRMADA";
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      cobranza_id: cobranzaId,
      nro_recibo: nroRecibo,
      total_cobrado: totalAhora,
      total_anticipo: anticipoEsperado,
      restante: Math.max(0, anticipoEsperado - totalAhora),
      nuevo_estado_venta: nuevoEstado,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error cobrar anticipo:", err);
    return NextResponse.json({ error: err.message || "Error al cobrar anticipo" }, { status: 500 });
  } finally {
    client.release();
  }
}
