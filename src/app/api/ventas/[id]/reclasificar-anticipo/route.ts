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
  monto_reclasificar: number;
  observaciones?: string | null;
};

/**
 * POST /api/ventas/[id]/reclasificar-anticipo
 * 
 * Reclasifica una parte (o el total) del anticipo cobrado a Descuento Comercial.
 * Solo permitido en estado AUTORIZADA y antes de contabilizar.
 * 
 * Efectos:
 *   1. Inserta registro en tabla descuentos_comerciales por el monto reclasificado
 *   2. Si la reclasificación es TOTAL: las cobranzas BORRADOR/CONFIRMADA pasan a RECLASIFICADA
 *   3. Si la reclasificación es PARCIAL: se divide la cobranza más grande
 *      - El monto reclasificado se quita de las cobranzas (estado RECLASIFICADA o reducción de monto)
 *      - Queda como cobranza activa el resto
 *   4. Actualiza venta: descuento_comercial += monto, anticipo -= monto
 *      (precio_total = precio_lista - desc_fin - desc_comercial)
 *   5. cuota_base e indicadores fiscales se RECALCULAN porque cambió precio_total
 * 
 * NOTA: NO cambia el estado de la venta. Sigue siendo AUTORIZADA.
 *       La contabilización se hace después como paso separado.
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

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });
  if (!body.monto_reclasificar || body.monto_reclasificar <= 0) {
    return NextResponse.json({ error: "Monto a reclasificar debe ser > 0" }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Validar estado AUTORIZADA
    const venta = await getVentaParaTransicion(client, schema, id, ["AUTORIZADA"]);
    const anticipoVenta = parseFloat(venta.anticipo || 0);

    if (anticipoVenta <= 0) {
      throw new Error("Esta venta no tiene anticipo");
    }

    // 2) Validar que el monto no exceda el anticipo total
    if (body.monto_reclasificar > anticipoVenta + 0.01) {
      throw new Error(
        `Monto a reclasificar ($${body.monto_reclasificar.toLocaleString("es-AR")}) excede el anticipo total ($${anticipoVenta.toLocaleString("es-AR")})`
      );
    }

    // 3) Obtener cobranzas de anticipo asociadas
    const cobranzasRes = await client.query(
      `SELECT id, nro_recibo, monto_total, estado::text 
       FROM ${schema}.cobranzas
       WHERE venta_id = $1::uuid AND es_anticipo_venta = true
         AND estado IN ('BORRADOR'::tenant_template.cobranza_estado, 'CONFIRMADA'::tenant_template.cobranza_estado)
       ORDER BY monto_total DESC, created_at ASC`,
      [id]
    );
    const cobranzas = cobranzasRes.rows;
    
    if (cobranzas.length === 0) {
      throw new Error("No hay cobranzas activas de anticipo para reclasificar");
    }
    
    const totalCobradoActual = cobranzas.reduce((s, c) => s + parseFloat(c.monto_total), 0);
    if (Math.abs(totalCobradoActual - anticipoVenta) > 0.02) {
      // Esto solo debería pasar si los datos están inconsistentes
      console.warn(
        `Inconsistencia: anticipo venta=${anticipoVenta}, total cobrado=${totalCobradoActual}`
      );
    }

    // 4) Reclasificar — algoritmo:
    //   Recorrer cobranzas (de mayor a menor monto), 
    //   restando del monto_a_reclasificar.
    //   - Si la cobranza cabe entera en lo que falta → cambiar estado a RECLASIFICADA
    //   - Si la cobranza es mayor que lo que falta → reducir su monto (split)
    let restanteReclasificar = body.monto_reclasificar;
    const cobranzasAfectadas: any[] = [];
    
    for (const cob of cobranzas) {
      if (restanteReclasificar <= 0.01) break;
      
      const montoCob = parseFloat(cob.monto_total);
      
      if (montoCob <= restanteReclasificar + 0.01) {
        // Reclasificar entera
        await client.query(
          `UPDATE ${schema}.cobranzas
           SET estado = 'RECLASIFICADA'::tenant_template.cobranza_estado,
               observaciones = COALESCE(observaciones, '') || ' [RECLASIFICADA por descuento comercial]'
           WHERE id = $1::uuid`,
          [cob.id]
        );
        cobranzasAfectadas.push({ id: cob.id, monto_reclasificado: montoCob, accion: "RECLASIFICADA_TOTAL" });
        restanteReclasificar -= montoCob;
      } else {
        // Reducir monto: cobranza queda con el saldo, se crea un registro hermano RECLASIFICADO
        // por la parte reclasificada (para mantener trazabilidad del monto cobrado original)
        const montoNuevo = montoCob - restanteReclasificar;
        const montoSplit = restanteReclasificar;
        
        // Reducir la cobranza original
        await client.query(
          `UPDATE ${schema}.cobranzas
           SET monto_total = $2,
               observaciones = COALESCE(observaciones, '') || ' [Reducida de $' || $3 || ' por reclasificación parcial]'
           WHERE id = $1::uuid`,
          [cob.id, montoNuevo, montoCob.toFixed(2)]
        );
        
        // Crear cobranza hermana en estado RECLASIFICADA con el monto reclasificado
        await client.query(
          `INSERT INTO ${schema}.cobranzas
             (fecha, persona_id, monto_total, moneda, medio_pago, estado, venta_id, es_anticipo_venta, observaciones)
           SELECT fecha, persona_id, $2, moneda, medio_pago,
                  'RECLASIFICADA'::tenant_template.cobranza_estado, venta_id, es_anticipo_venta,
                  '[Reclasificada de cobranza ' || nro_recibo || ']'
           FROM ${schema}.cobranzas WHERE id = $1::uuid`,
          [cob.id, montoSplit]
        );
        
        cobranzasAfectadas.push({ id: cob.id, monto_reclasificado: montoSplit, accion: "RECLASIFICADA_PARCIAL" });
        restanteReclasificar = 0;
      }
    }

    if (restanteReclasificar > 0.01) {
      throw new Error(
        `No se pudo reclasificar todo el monto. Pendiente: $${restanteReclasificar.toLocaleString("es-AR")}`
      );
    }

    // 5) Insertar registro en descuentos_comerciales
    const cobranzaPrincipal = cobranzas[0]; // referencia para auditoría
    await client.query(
      `INSERT INTO ${schema}.descuentos_comerciales
         (venta_id, monto, cobranza_original_id, autorizado_por_label, fecha, observaciones)
       VALUES ($1::uuid, $2, $3::uuid, $5, NOW(), $4)`,
      [
        id,
        body.monto_reclasificar,
        cobranzaPrincipal.id,
        body.observaciones || "Reclasificacion de anticipo a descuento comercial",
        sessionLabel(session),
      ]
    );

    // 6) Recalcular precio_total de la venta
    //    descuento_comercial += monto_reclasificar
    //    anticipo            -= monto_reclasificar
    //    precio_total = precio_lista - descuento_financiero - descuento_comercial
    //    (a_financiar = precio_total - anticipo) NO cambia: precio_total y anticipo se reducen en el mismo monto
    const precioLista = parseFloat(venta.precio_lista || 0);
    const descFin = parseFloat(venta.descuento_financiero || 0);
    const descComActual = parseFloat(venta.descuento_comercial || 0);
    const nuevoDescCom = descComActual + body.monto_reclasificar;
    const nuevoAnticipo = anticipoVenta - body.monto_reclasificar;
    const nuevoPrecioTotal = precioLista - descFin - nuevoDescCom;
    
    // Recalcular descomposición IVA del nuevo precio total
    const tenantConfig = await client.query(
      `SELECT COALESCE((config->>'porc_gravado')::numeric, 0) AS porc_gravado FROM shared.tenants WHERE slug = $1`,
      [body.tenant]
    );
    const porcGravado = parseFloat(tenantConfig.rows[0]?.porc_gravado || 0);
    
    const IVA_RATE = 0.21;
    const gravadoConIva = round(nuevoPrecioTotal * porcGravado);
    const capitalEx = round(nuevoPrecioTotal * (1 - porcGravado));
    const capitalGr = round(gravadoConIva / (1 + IVA_RATE));
    const ivaCapital = round(gravadoConIva - capitalGr);
    
    await client.query(
      `UPDATE ${schema}.ventas
       SET descuento_comercial = $2,
           anticipo = $3,
           precio_total = $4,
           capital_total_gr = $5,
           capital_total_ex = $6,
           iva_capital_total = $7,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [id, nuevoDescCom, nuevoAnticipo, nuevoPrecioTotal, capitalGr, capitalEx, ivaCapital]
    );

    // 7) Registrar en historial
    await registrarHistorial(
      client, schema, id,
      "AUTORIZADA", "AUTORIZADA",
      `Reclasificación de anticipo: $${body.monto_reclasificar.toLocaleString("es-AR")} a descuento comercial`, sessionLabel(session),
      {
        monto_reclasificado: body.monto_reclasificar,
        cobranzas_afectadas: cobranzasAfectadas,
        nuevo_anticipo: nuevoAnticipo,
        nuevo_desc_comercial: nuevoDescCom,
        nuevo_precio_total: nuevoPrecioTotal,
      }
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      monto_reclasificado: body.monto_reclasificar,
      nuevo_anticipo: nuevoAnticipo,
      nuevo_desc_comercial: nuevoDescCom,
      nuevo_precio_total: nuevoPrecioTotal,
      cobranzas_afectadas: cobranzasAfectadas,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error reclasificar:", err);
    return NextResponse.json({ error: err.message || "Error al reclasificar" }, { status: 500 });
  } finally {
    client.release();
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
