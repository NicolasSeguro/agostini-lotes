// ============================================================================
//  WORKFLOW DE VENTAS - utilidades compartidas
// ============================================================================

import { PoolClient } from "pg";

/**
 * Registrar un cambio de estado en venta_historial.
 * Se llama SIEMPRE dentro de una transaccion.
 */
export async function registrarHistorial(
  client: PoolClient,
  schema: string,
  ventaId: string,
  estadoAnterior: string | null,
  estadoNuevo: string,
  motivo: string,
  usuarioLabel: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  await client.query(
    `
    INSERT INTO ${schema}.venta_historial
      (venta_id, estado_anterior, estado_nuevo, usuario_label, motivo, metadata)
    VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
    `,
    [ventaId, estadoAnterior, estadoNuevo, usuarioLabel, motivo, JSON.stringify(metadata)]
  );
}

/**
 * Obtener el total cobrado en concepto de anticipo para una venta.
 * Suma todas las cobranzas con es_anticipo_venta = true y estado en (BORRADOR, CONFIRMADA).
 * Las RECLASIFICADAS no cuentan.
 */
export async function totalAnticipoCobrado(
  client: PoolClient,
  schema: string,
  ventaId: string
): Promise<number> {
  const res = await client.query(
    `
    SELECT COALESCE(SUM(monto_total), 0) AS total
    FROM ${schema}.cobranzas
    WHERE venta_id = $1::uuid
      AND es_anticipo_venta = true
      AND estado IN ('BORRADOR'::tenant_template.cobranza_estado, 'CONFIRMADA'::tenant_template.cobranza_estado)
    `,
    [ventaId]
  );
  return parseFloat(res.rows[0]?.total || 0);
}

/**
 * Validar y obtener el estado actual de una venta. Lockea el registro
 * para evitar race conditions en transiciones de estado.
 */
export async function getVentaParaTransicion(
  client: PoolClient,
  schema: string,
  ventaId: string,
  estadosPermitidos: string[]
): Promise<any> {
  const res = await client.query(
    `SELECT * FROM ${schema}.ventas WHERE id = $1::uuid FOR UPDATE`,
    [ventaId]
  );
  if (res.rows.length === 0) {
    throw new Error("Venta no encontrada");
  }
  const venta = res.rows[0];
  if (!estadosPermitidos.includes(venta.estado)) {
    throw new Error(
      `Operacion no permitida en estado ${venta.estado}. Estados validos: ${estadosPermitidos.join(", ")}`
    );
  }
  return venta;
}

/**
 * Genera el array de fechas de vencimiento mensual a partir de una fecha base.
 */
export function generarFechasVencimiento(fechaPrimerVto: string, cantCuotas: number): string[] {
  const fechas: string[] = [];
  const base = new Date(fechaPrimerVto + "T00:00:00");
  const dia = base.getDate();
  
  for (let i = 0; i < cantCuotas; i++) {
    const fecha = new Date(base.getFullYear(), base.getMonth() + i, dia);
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const dd = String(fecha.getDate()).padStart(2, "0");
    fechas.push(`${yyyy}-${mm}-${dd}`);
  }
  return fechas;
}

/**
 * Descomposicion IVA para una cuota individual.
 * Usa el mismo modelo que venta-calc.ts:
 *   - El monto se descompone aplicando porc_gravado directamente
 *   - capital_gr_neto = (monto x porc_gravado) / 1.21
 *   - capital_ex      = monto x (1 - porc_gravado)
 *   - iva_capital     = monto x porc_gravado - capital_gr_neto
 */
export function descomponerCuota(
  cuotaBase: number,
  porcGravado: number,
  porcInteres: number = 0
): {
  capital_gr_orig: number;
  capital_ex_orig: number;
  iva_capital_orig: number;
  interes_gr_orig: number;
  interes_ex_orig: number;
  iva_interes_orig: number;
} {
  const IVA = 0.21;
  
  const interes_total = round(cuotaBase * porcInteres);
  const capital_total = round(cuotaBase - interes_total);
  
  const gravado_capital_con_iva = round(capital_total * porcGravado);
  const capital_ex_orig = round(capital_total * (1 - porcGravado));
  const capital_gr_orig = round(gravado_capital_con_iva / (1 + IVA));
  const iva_capital_orig = round(gravado_capital_con_iva - capital_gr_orig);
  
  const gravado_interes_con_iva = round(interes_total * porcGravado);
  const interes_ex_orig = round(interes_total * (1 - porcGravado));
  const interes_gr_orig = round(gravado_interes_con_iva / (1 + IVA));
  const iva_interes_orig = round(gravado_interes_con_iva - interes_gr_orig);
  
  return {
    capital_gr_orig,
    capital_ex_orig,
    iva_capital_orig,
    interes_gr_orig,
    interes_ex_orig,
    iva_interes_orig,
  };
}

/**
 * Revierte la reclasificacion (descuentos_comerciales) de una venta.
 * - Suma los montos de descuentos_comerciales
 * - Restaura cobranzas RECLASIFICADAS al estado anterior
 * - Recalcula precio_total, anticipo, descuento_comercial y descomposicion IVA
 * - Borra los registros de descuentos_comerciales
 *
 * NO maneja BEGIN/COMMIT (debe estar dentro de una transaccion).
 * Movida desde el route.ts a este helper porque Next.js solo permite
 * exports tipo GET/POST/etc en archivos route.ts.
 */
export async function revertirReclasificacionInterno(
  client: PoolClient,
  schema: string,
  tenant: string,
  ventaId: string,
  venta: any,
  motivo: string,
  usuarioLabel: string
): Promise<{
  tenia_reclasificacion: boolean;
  monto_total: number;
  cobranzas_restauradas: number;
}> {
  const descRes = await client.query(
    `SELECT id, monto, cobranza_original_id, observaciones
     FROM ${schema}.descuentos_comerciales
     WHERE venta_id = $1::uuid`,
    [ventaId]
  );

  if (descRes.rows.length === 0) {
    return { tenia_reclasificacion: false, monto_total: 0, cobranzas_restauradas: 0 };
  }

  const montoTotal = descRes.rows.reduce((s, d) => s + parseFloat(d.monto), 0);

  const cobrRes = await client.query(
    `SELECT id, monto_total, estado::text AS estado, observaciones
     FROM ${schema}.cobranzas
     WHERE venta_id = $1::uuid AND es_anticipo_venta = true`,
    [ventaId]
  );

  let cobranzasRestauradas = 0;

  for (const cob of cobrRes.rows) {
    const obs = cob.observaciones || "";

    if (cob.estado === "RECLASIFICADA") {
      if (obs.includes("[Reclasificada de cobranza")) {
        await client.query(`DELETE FROM ${schema}.cobranzas WHERE id = $1::uuid`, [cob.id]);
        cobranzasRestauradas++;
        continue;
      }
      await client.query(
        `UPDATE ${schema}.cobranzas
         SET estado = 'BORRADOR'::tenant_template.cobranza_estado,
             observaciones = COALESCE(observaciones, '') || ' [Reclasificacion revertida]'
         WHERE id = $1::uuid`,
        [cob.id]
      );
      cobranzasRestauradas++;
    } else if (obs.includes("[Reducida de $")) {
      const match = obs.match(/\[Reducida de \$([\d.]+) por reclasificacion parcial\]/);
      if (match) {
        const montoOriginal = parseFloat(match[1]);
        await client.query(
          `UPDATE ${schema}.cobranzas
           SET monto_total = $2,
               observaciones = REPLACE(observaciones, $3, '') || ' [Restaurada]'
           WHERE id = $1::uuid`,
          [cob.id, montoOriginal, match[0]]
        );
        cobranzasRestauradas++;
      }
    }
  }

  await client.query(
    `DELETE FROM ${schema}.descuentos_comerciales WHERE venta_id = $1::uuid`,
    [ventaId]
  );

  const precioLista = parseFloat(venta.precio_lista || 0);
  const descFin = parseFloat(venta.descuento_financiero || 0);
  const descComActual = parseFloat(venta.descuento_comercial || 0);
  const anticipoActual = parseFloat(venta.anticipo || 0);

  const nuevoDescCom = Math.max(0, descComActual - montoTotal);
  const nuevoAnticipo = anticipoActual + montoTotal;
  const nuevoPrecioTotal = precioLista - descFin - nuevoDescCom;

  const tenantConfig = await client.query(
    `SELECT COALESCE((config->>'porc_gravado')::numeric, 0) AS porc_gravado FROM shared.tenants WHERE slug = $1`,
    [tenant]
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
    [ventaId, nuevoDescCom, nuevoAnticipo, nuevoPrecioTotal, capitalGr, capitalEx, ivaCapital]
  );

  await registrarHistorial(
    client, schema, ventaId,
    venta.estado, venta.estado,
    `Reversion de reclasificacion: ${motivo}. Monto restaurado al anticipo: $${montoTotal.toLocaleString("es-AR")}`,
    usuarioLabel,
    {
      monto_revertido: montoTotal,
      cobranzas_restauradas: cobranzasRestauradas,
      descuentos_borrados: descRes.rows.length,
      nuevo_anticipo: nuevoAnticipo,
      nuevo_desc_comercial: nuevoDescCom,
    }
  );

  return {
    tenia_reclasificacion: true,
    monto_total: montoTotal,
    cobranzas_restauradas: cobranzasRestauradas,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
