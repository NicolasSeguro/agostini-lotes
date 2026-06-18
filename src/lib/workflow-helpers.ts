// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  WORKFLOW DE VENTAS - utilidades compartidas
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import { PoolClient } from "pg";

/**
 * Registrar un cambio de estado en venta_historial.
 * Se llama SIEMPRE dentro de una transacciÃ³n.
 */
export async function registrarHistorial(
  client: PoolClient,
  schema: string,
  ventaId: string,
  estadoAnterior: string | null,
  estadoNuevo: string,
  motivo: string,
  usuarioLabel: string = "admin",
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
      `OperaciÃ³n no permitida en estado ${venta.estado}. Estados vÃ¡lidos: ${estadosPermitidos.join(", ")}`
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
 * DescomposiciÃ³n IVA para una cuota individual.
 * Usa el mismo modelo que venta-calc.ts:
 *   - El monto se descompone aplicando porc_gravado directamente
 *   - capital_gr_neto = (monto Ã— porc_gravado) / 1.21
 *   - capital_ex      = monto Ã— (1 - porc_gravado)
 *   - iva_capital     = monto Ã— porc_gravado - capital_gr_neto
 */
export function descomponerCuota(
  cuotaBase: number,
  porcGravado: number,
  porcInteres: number = 0  // % de la cuota que es interÃ©s (FrancÃ©s)
): {
  capital_gr_orig: number;
  capital_ex_orig: number;
  iva_capital_orig: number;
  interes_gr_orig: number;
  interes_ex_orig: number;
  iva_interes_orig: number;
} {
  const IVA = 0.21;
  
  // Separar capital e interÃ©s primero
  const interes_total = round(cuotaBase * porcInteres);
  const capital_total = round(cuotaBase - interes_total);
  
  // Descomponer capital
  const gravado_capital_con_iva = round(capital_total * porcGravado);
  const capital_ex_orig = round(capital_total * (1 - porcGravado));
  const capital_gr_orig = round(gravado_capital_con_iva / (1 + IVA));
  const iva_capital_orig = round(gravado_capital_con_iva - capital_gr_orig);
  
  // Descomponer interÃ©s
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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
