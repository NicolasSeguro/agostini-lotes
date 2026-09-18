import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import { registrarHistorial, getVentaParaTransicion, totalAnticipoCobrado } from "@/lib/workflow-helpers";

type Body = {
  tenant: string;
};

/**
 * POST /api/ventas/[id]/cerrar-pendiente
 * 
 * Cierra la carga del vendedor. El sistema decide el estado destino segÃºn
 * si ya hay anticipo cobrado (caso de venta corregida tras rechazo):
 * 
 *   - Si NO hay anticipo cobrado o anticipo de la venta == 0:
 *       Si anticipo de venta > 0 â†’ CERRADA_PENDIENTE (espera cobro)
 *       Si anticipo de venta = 0 â†’ CERRADA_CONFIRMADA (no hay nada que cobrar)
 *   
 *   - Si hay anticipo cobrado vigente:
 *       Si cobrado == anticipo de venta â†’ CERRADA_CONFIRMADA (anticipo cubierto)
 *       Si cobrado < anticipo de venta  â†’ CERRADA_PENDIENTE (falta cobrar diferencia)
 *       Si cobrado > anticipo de venta  â†’ genera saldo_a_favor por el excedente,
 *                                          pasa a CERRADA_CONFIRMADA
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

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const venta = await getVentaParaTransicion(client, schema, id, ["EN_CARGA"]);
    const anticipoVenta = parseFloat(venta.anticipo || 0);
    
    // Anticipo ya cobrado (vigente, suma cobranzas BORRADOR + CONFIRMADA)
    const anticipoCobrado = await totalAnticipoCobrado(client, schema, id);

    // Decidir estado destino
    let estadoDestino: string;
    let mensajeHistorial: string;
    let saldoCreado: { monto: number; id: string } | null = null;

    if (anticipoVenta === 0) {
      // Venta sin anticipo: pasa directo a CERRADA_CONFIRMADA
      estadoDestino = "CERRADA_CONFIRMADA";
      mensajeHistorial = "Cerrada por vendedor (sin anticipo, pasa directo a confirmada)";
    } else if (anticipoCobrado === 0) {
      // Venta con anticipo pero nada cobrado: queda pendiente
      estadoDestino = "CERRADA_PENDIENTE";
      mensajeHistorial = "Cerrada por vendedor, esperando cobro de anticipo";
    } else if (Math.abs(anticipoCobrado - anticipoVenta) < 0.01) {
      // Anticipo exactamente cubierto (caso tÃ­pico tras corregir rechazo)
      estadoDestino = "CERRADA_CONFIRMADA";
      mensajeHistorial = `Cerrada con anticipo ya cobrado ($${anticipoCobrado.toLocaleString("es-AR")}). Pasa directo a confirmada.`;
    } else if (anticipoCobrado < anticipoVenta) {
      // Cobrado parcial: queda pendiente la diferencia
      const falta = anticipoVenta - anticipoCobrado;
      estadoDestino = "CERRADA_PENDIENTE";
      mensajeHistorial = `Cerrada. Anticipo cobrado parcial ($${anticipoCobrado.toLocaleString("es-AR")}). Falta cobrar $${falta.toLocaleString("es-AR")}`;
    } else {
      // Cobrado en exceso: generar saldo a favor por la diferencia
      const excedente = anticipoCobrado - anticipoVenta;
      
      // Obtener primer titular como dueÃ±o del saldo
      const tit = await client.query(
        `SELECT persona_id FROM ${schema}.venta_titulares WHERE venta_id = $1::uuid ORDER BY orden LIMIT 1`,
        [id]
      );
      const personaId = tit.rows[0]?.persona_id;

      // Obtener la primera cobranza vigente como origen
      const cob = await client.query(
        `SELECT id FROM ${schema}.cobranzas 
         WHERE venta_id = $1::uuid AND es_anticipo_venta = true
           AND estado IN ('BORRADOR'::tenant_template.cobranza_estado, 'CONFIRMADA'::tenant_template.cobranza_estado)
         ORDER BY created_at DESC LIMIT 1`,
        [id]
      );
      const origenCobranzaId = cob.rows[0]?.id;

      const saldoRes = await client.query(
        `INSERT INTO ${schema}.saldos_a_favor 
           (persona_id, venta_id, origen_cobranza_id, monto_origen, monto_actual, moneda, observaciones)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $4, 'ARS', $5)
         RETURNING id`,
        [
          personaId,
          id,
          origenCobranzaId,
          excedente,
          `Excedente de anticipo al corregir venta (cobrado ${anticipoCobrado.toLocaleString("es-AR")}, nuevo anticipo ${anticipoVenta.toLocaleString("es-AR")})`,
        ]
      );
      saldoCreado = { monto: excedente, id: saldoRes.rows[0].id };
      
      estadoDestino = "CERRADA_CONFIRMADA";
      mensajeHistorial = `Cerrada. Anticipo cobrado ($${anticipoCobrado.toLocaleString("es-AR")}) excede al nuevo ($${anticipoVenta.toLocaleString("es-AR")}). Saldo a favor: $${excedente.toLocaleString("es-AR")}`;
    }

    // Actualizar venta
    const updateFecha = estadoDestino === "CERRADA_CONFIRMADA"
      ? `fecha_cerrada_pendiente = NOW(), fecha_cerrada_confirmada = NOW(),`
      : `fecha_cerrada_pendiente = NOW(),`;
    
    await client.query(
      `UPDATE ${schema}.ventas 
       SET estado = $2::tenant_template.venta_estado,
           ${updateFecha}
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id, estadoDestino]
    );

    await registrarHistorial(
      client, schema, id,
      "EN_CARGA", estadoDestino,
      mensajeHistorial, sessionLabel(session),
      {
        anticipo_venta: anticipoVenta,
        anticipo_cobrado: anticipoCobrado,
        saldo_a_favor_creado: saldoCreado,
      }
    );

    await client.query("COMMIT");
    return NextResponse.json({ 
      ok: true, 
      nuevo_estado: estadoDestino,
      anticipo_cubierto: anticipoCobrado >= anticipoVenta,
      saldo_a_favor: saldoCreado,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
