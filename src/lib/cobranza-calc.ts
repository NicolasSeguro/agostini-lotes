// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CÃLCULO DE COBRANZAS - LÃ“GICA CENTRAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
// Funciones puras (sin side-effects) para calcular saldos pendientes,
// punitorios y distribuciÃ³n de imputaciones parciales.
//
// REGLAS:
// 1. Orden de imputaciÃ³n: punitorios â†’ interÃ©s â†’ ajuste â†’ capital (cada
//    uno con su IVA correspondiente)
// 2. Punitorios entre pagos parciales: sobre saldo total pendiente
// 3. IVA por concepto: proporciÃ³n gravada/exenta derivada de la cuota
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const TASA_PUNITORIA_DIARIA = 0.004; // 0.4% diario
export const IVA_RATE = 0.21;

/**
 * Datos originales de una cuota (lo nominal que se firmÃ³ en el boleto)
 */
export type CuotaOriginal = {
  id: string;
  numero: number;
  fecha_vto: string;
  estado: string;
  // Cuota base ajustada vigente (lo que vale HOY)
  cuota_base_actual: number;
  // Datos nominales (descomposiciÃ³n original del boleto)
  capital_gr_orig: number;
  capital_ex_orig: number;
  iva_capital_orig: number;
  interes_gr_orig: number;
  interes_ex_orig: number;
  iva_interes_orig: number;
};

/**
 * Lo que ya se imputÃ³ (de cobranzas previas, parciales)
 */
export type ImputacionPrevia = {
  fecha: string;
  monto_capital: number;
  monto_iva: number;
  monto_interes: number;
  monto_ajuste: number;
  monto_punitorios: number;
  condonacion_punitorios: number;
  iva_capital: number;
  iva_interes: number;
  iva_ajuste: number;
  iva_punitorios: number;
};

/**
 * Saldo pendiente desglosado de una cuota
 */
export type SaldoCuota = {
  cuota_id: string;
  numero: number;
  fecha_vto: string;
  estado: string;
  dias_vencidos: number;
  ultima_fecha_pago: string | null;
  // Saldo pendiente por concepto
  capital_pendiente: number;
  iva_capital_pendiente: number;
  interes_pendiente: number;
  iva_interes_pendiente: number;
  ajuste_pendiente: number;
  iva_ajuste_pendiente: number;
  punitorios_pendientes: number;
  iva_punitorios_pendientes: number;
  // Totales
  saldo_total_sin_punitorios: number;
  saldo_total_con_punitorios: number;
  // ProporciÃ³n gravado/exento (heredada de la cuota)
  prop_gravada: number;
};

/**
 * Una imputaciÃ³n a aplicar sobre una cuota
 */
export type ImputacionNueva = {
  cuota_id: string;
  monto_capital: number;
  iva_capital: number;
  monto_interes: number;
  iva_interes: number;
  monto_ajuste: number;
  iva_ajuste: number;
  monto_punitorios: number;
  iva_punitorios: number;
  condonacion_punitorios: number;
  monto_total: number;
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcDiasVencidos(fechaVto: any, hoy: Date = new Date()): number {
  const vtoStr = toDateString(fechaVto);
  if (!vtoStr) return 0;
  const vto = new Date(vtoStr + "T00:00:00");
  const diff = Math.floor((hoy.getTime() - vto.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function calcDiasEntre(desde: any, hasta: Date = new Date()): number {
  const desdeStr = toDateString(desde);
  if (!desdeStr) return 0;
  const d1 = new Date(desdeStr + "T00:00:00");
  const diff = Math.floor((hasta.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CÃLCULO DEL SALDO PENDIENTE DE UNA CUOTA
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function calcularSaldoCuota(
  cuota: CuotaOriginal,
  imputacionesPrevias: ImputacionPrevia[],
  hoy: Date = new Date()
): SaldoCuota {
  // Totales nominales originales (capital + IVA capital + interÃ©s + IVA interÃ©s)
  const capital_nominal = (cuota.capital_gr_orig || 0) + (cuota.capital_ex_orig || 0);
  const iva_capital_nominal = cuota.iva_capital_orig || 0;
  const interes_nominal = (cuota.interes_gr_orig || 0) + (cuota.interes_ex_orig || 0);
  const iva_interes_nominal = cuota.iva_interes_orig || 0;
  
  // ProporciÃ³n gravada (para calcular IVA del ajuste)
  // Si capital_gr_orig + capital_ex_orig = 0, asumimos 100% gravado
  const total_capital_para_prop = (cuota.capital_gr_orig || 0) + (cuota.capital_ex_orig || 0);
  const prop_gravada = total_capital_para_prop > 0
    ? (cuota.capital_gr_orig || 0) / total_capital_para_prop
    : 1;

  // Sumar lo ya imputado (lo necesitamos antes para calcular saldos)
  const sumaPrev = imputacionesPrevias.reduce((acc, imp) => ({
    capital: acc.capital + (imp.monto_capital || 0),
    iva_capital: acc.iva_capital + (imp.iva_capital || 0),
    interes: acc.interes + (imp.monto_interes || 0),
    iva_interes: acc.iva_interes + (imp.iva_interes || 0),
    ajuste: acc.ajuste + (imp.monto_ajuste || 0),
    iva_ajuste: acc.iva_ajuste + (imp.iva_ajuste || 0),
    punitorios: acc.punitorios + (imp.monto_punitorios || 0),
    iva_punitorios: acc.iva_punitorios + (imp.iva_punitorios || 0),
    condonacion: acc.condonacion + (imp.condonacion_punitorios || 0),
  }), {
    capital: 0, iva_capital: 0, interes: 0, iva_interes: 0,
    ajuste: 0, iva_ajuste: 0, punitorios: 0, iva_punitorios: 0,
    condonacion: 0,
  });
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CÃLCULO DEL AJUSTE â€” fÃ³rmula correcta
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // cuota_base_actual representa el VALOR TOTAL FINAL de la cuota
  // (todo incluido). El ajuste es la diferencia con el nominal:
  //   ajuste_con_iva = cuota_base - (capital + iva_cap + interes + iva_int)
  //
  // DescomposiciÃ³n (mismo modelo que en venta-calc.ts):
  //   El % gravado de la cuota aplica directamente al ajuste total.
  //   La parte gravada YA INCLUYE el IVA:
  //     ajuste_gravado_con_iva = ajuste_con_iva Ã— prop_gravada_cuota
  //     ajuste_exento          = ajuste_con_iva Ã— (1 - prop_gravada_cuota)
  //     ajuste_neto_gravado    = ajuste_gravado_con_iva / (1 + IVA)
  //     iva_ajuste             = ajuste_gravado_con_iva - ajuste_neto_gravado
  //
  // En este modelo "ajuste_total_sin_iva" se compone de:
  //   ajuste_exento + ajuste_neto_gravado (suma de las partes sin IVA)
  // y el "iva_ajuste_total" es solo el IVA de la parte gravada.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  
  // Lo nominal con IVA (capital + IVA capital + interÃ©s + IVA interÃ©s)
  const nominal_con_iva = capital_nominal + iva_capital_nominal + interes_nominal + iva_interes_nominal;
  
  // Calcular la proporciÃ³n gravada CON IVA de la cuota (basado en el nominal)
  // prop_gravada_total = (capital_gr_nominal + iva_capital_nominal) / nominal_con_iva
  // (Lo "gravado con IVA" del nominal sobre el total nominal con IVA)
  const total_capital_gr_con_iva = (cuota.capital_gr_orig || 0) + (cuota.iva_capital_orig || 0);
  const prop_gravada_con_iva = nominal_con_iva > 0
    ? total_capital_gr_con_iva / nominal_con_iva
    : prop_gravada; // fallback si no hay nominal
  
  // Ajuste total con IVA incluido
  const ajuste_con_iva_total = Math.max(0, cuota.cuota_base_actual - nominal_con_iva);
  
  // DescomposiciÃ³n por proporciÃ³n
  const ajuste_gravado_con_iva = round(ajuste_con_iva_total * prop_gravada_con_iva);
  const ajuste_exento_total = round(ajuste_con_iva_total * (1 - prop_gravada_con_iva));
  const ajuste_neto_gravado = round(ajuste_gravado_con_iva / (1 + IVA_RATE));
  const iva_ajuste_total = round(ajuste_gravado_con_iva - ajuste_neto_gravado);
  
  // ajuste_total_sin_iva = parte que se imputa en la cuenta "Ajuste" (gravado neto + exento)
  const ajuste_total_sin_iva = round(ajuste_neto_gravado + ajuste_exento_total);

  // Saldos pendientes por concepto
  const capital_pendiente = Math.max(0, round(capital_nominal - sumaPrev.capital));
  const iva_capital_pendiente = Math.max(0, round(iva_capital_nominal - sumaPrev.iva_capital));
  const interes_pendiente = Math.max(0, round(interes_nominal - sumaPrev.interes));
  const iva_interes_pendiente = Math.max(0, round(iva_interes_nominal - sumaPrev.iva_interes));
  const ajuste_pendiente = Math.max(0, round(ajuste_total_sin_iva - sumaPrev.ajuste));
  const iva_ajuste_pendiente = Math.max(0, round(iva_ajuste_total - sumaPrev.iva_ajuste));

  // Saldo total pendiente sin punitorios
  const saldo_total_sin_punitorios = round(
    capital_pendiente + iva_capital_pendiente +
    interes_pendiente + iva_interes_pendiente +
    ajuste_pendiente + iva_ajuste_pendiente
  );

  // Calcular dÃ­as para punitorios:
  // - Si nunca se pagÃ³ nada: desde fecha_vto hasta hoy
  // - Si hubo pagos parciales: desde fecha del Ãºltimo pago hasta hoy
  const dias_vencidos_total = calcDiasVencidos(cuota.fecha_vto, hoy);
  
  let dias_para_punitorios = 0;
  let ultima_fecha_pago: string | null = null;
  
  if (imputacionesPrevias.length > 0) {
    // Tomar la fecha del pago mÃ¡s reciente
    const fechasOrdenadas = imputacionesPrevias
      .map(i => i.fecha)
      .sort((a, b) => b.localeCompare(a));
    ultima_fecha_pago = fechasOrdenadas[0];
    dias_para_punitorios = calcDiasEntre(ultima_fecha_pago, hoy);
  } else {
    // Sin pagos previos: dÃ­as desde el vencimiento
    dias_para_punitorios = dias_vencidos_total;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PUNITORIOS con IVA CAPITALIZADO (mismo modelo que ajuste)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // El monto de punitorios que el cliente paga ya incluye el IVA.
  //   punitorios_con_iva = saldo Ã— 0.004 Ã— dÃ­as
  //
  // DescomposiciÃ³n por proporciÃ³n gravada de la cuota:
  //   pun_gravado_con_iva = punitorios_con_iva Ã— prop_gravada_con_iva
  //   pun_exento          = punitorios_con_iva Ã— (1 - prop_gravada_con_iva)
  //   pun_neto_gravado    = pun_gravado_con_iva / (1 + IVA)
  //   iva_punitorios      = pun_gravado_con_iva - pun_neto_gravado
  //
  // "punitorios_pendientes" devuelve la suma sin IVA (gravado neto + exento),
  // y "iva_punitorios_pendientes" solo el IVA de la parte gravada.
  // El cliente paga "punitorios_con_iva" en total.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  let punitorios_con_iva = 0;
  if (saldo_total_sin_punitorios > 0 && dias_para_punitorios > 0) {
    punitorios_con_iva = round(saldo_total_sin_punitorios * TASA_PUNITORIA_DIARIA * dias_para_punitorios);
  }
  
  const pun_gravado_con_iva = round(punitorios_con_iva * prop_gravada_con_iva);
  const pun_exento_total = round(punitorios_con_iva * (1 - prop_gravada_con_iva));
  const pun_neto_gravado = round(pun_gravado_con_iva / (1 + IVA_RATE));
  const iva_punitorios_pendientes = round(pun_gravado_con_iva - pun_neto_gravado);
  const punitorios_pendientes = round(pun_neto_gravado + pun_exento_total);

  // El total que paga el cliente: saldo + punitorios con IVA capitalizado
  const saldo_total_con_punitorios = round(saldo_total_sin_punitorios + punitorios_con_iva);

  return {
    cuota_id: cuota.id,
    numero: cuota.numero,
    fecha_vto: cuota.fecha_vto,
    estado: cuota.estado,
    dias_vencidos: dias_vencidos_total,
    ultima_fecha_pago,
    capital_pendiente,
    iva_capital_pendiente,
    interes_pendiente,
    iva_interes_pendiente,
    ajuste_pendiente,
    iva_ajuste_pendiente,
    punitorios_pendientes,
    iva_punitorios_pendientes,
    saldo_total_sin_punitorios,
    saldo_total_con_punitorios,
    prop_gravada,
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// IMPUTACIÃ“N PARCIAL: dado un monto a pagar, distribuir segÃºn orden
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Aplica un monto a una cuota segÃºn el orden de imputaciÃ³n:
 * 1. Punitorios + IVA punitorios
 * 2. InterÃ©s + IVA interÃ©s
 * 3. Ajuste + IVA ajuste
 * 4. Capital + IVA capital
 *
 * `bonificacionPunitorios`: monto que se condona de punitorios (no se cobra
 * pero queda registrado).
 */
export function calcularImputacion(
  saldo: SaldoCuota,
  montoAImputar: number,
  bonificacionPunitorios: number = 0
): ImputacionNueva {
  // Validar bonificaciÃ³n
  const bonificacion = Math.min(
    bonificacionPunitorios,
    saldo.punitorios_pendientes + saldo.iva_punitorios_pendientes
  );

  let restante = montoAImputar;
  const imp: ImputacionNueva = {
    cuota_id: saldo.cuota_id,
    monto_capital: 0,
    iva_capital: 0,
    monto_interes: 0,
    iva_interes: 0,
    monto_ajuste: 0,
    iva_ajuste: 0,
    monto_punitorios: 0,
    iva_punitorios: 0,
    condonacion_punitorios: bonificacion,
    monto_total: 0,
  };

  // CuÃ¡nto efectivamente cobra de punitorios (descontando bonificaciÃ³n)
  // La bonificaciÃ³n se reparte proporcionalmente entre punitorios y su IVA
  let punitorios_a_cobrar = saldo.punitorios_pendientes;
  let iva_punitorios_a_cobrar = saldo.iva_punitorios_pendientes;
  
  if (bonificacion > 0) {
    const totalPuni = saldo.punitorios_pendientes + saldo.iva_punitorios_pendientes;
    if (totalPuni > 0) {
      const propPuniPuro = saldo.punitorios_pendientes / totalPuni;
      const reducePuni = bonificacion * propPuniPuro;
      const reduceIva = bonificacion * (1 - propPuniPuro);
      punitorios_a_cobrar = Math.max(0, round(saldo.punitorios_pendientes - reducePuni));
      iva_punitorios_a_cobrar = Math.max(0, round(saldo.iva_punitorios_pendientes - reduceIva));
    }
  }

  // PASO 1: Punitorios + IVA punitorios
  const pagar_puni = Math.min(restante, punitorios_a_cobrar);
  imp.monto_punitorios = round(pagar_puni);
  restante = round(restante - pagar_puni);
  
  const pagar_iva_puni = Math.min(restante, iva_punitorios_a_cobrar);
  imp.iva_punitorios = round(pagar_iva_puni);
  restante = round(restante - pagar_iva_puni);

  // PASO 2: InterÃ©s compensatorio + IVA interÃ©s
  const pagar_int = Math.min(restante, saldo.interes_pendiente);
  imp.monto_interes = round(pagar_int);
  restante = round(restante - pagar_int);
  
  const pagar_iva_int = Math.min(restante, saldo.iva_interes_pendiente);
  imp.iva_interes = round(pagar_iva_int);
  restante = round(restante - pagar_iva_int);

  // PASO 3: Ajuste + IVA ajuste
  const pagar_aj = Math.min(restante, saldo.ajuste_pendiente);
  imp.monto_ajuste = round(pagar_aj);
  restante = round(restante - pagar_aj);
  
  const pagar_iva_aj = Math.min(restante, saldo.iva_ajuste_pendiente);
  imp.iva_ajuste = round(pagar_iva_aj);
  restante = round(restante - pagar_iva_aj);

  // PASO 4: Capital + IVA capital
  const pagar_cap = Math.min(restante, saldo.capital_pendiente);
  imp.monto_capital = round(pagar_cap);
  restante = round(restante - pagar_cap);
  
  const pagar_iva_cap = Math.min(restante, saldo.iva_capital_pendiente);
  imp.iva_capital = round(pagar_iva_cap);
  restante = round(restante - pagar_iva_cap);

  imp.monto_total = round(
    imp.monto_punitorios + imp.iva_punitorios +
    imp.monto_interes + imp.iva_interes +
    imp.monto_ajuste + imp.iva_ajuste +
    imp.monto_capital + imp.iva_capital
  );

  return imp;
}

/**
 * Determina si una cuota quedarÃ­a completamente pagada al imputar
 * el monto + la bonificaciÃ³n.
 */
export function cuotaQuedaPaga(
  saldo: SaldoCuota,
  imputacion: ImputacionNueva
): boolean {
  // Suma de todo lo pendiente
  const totalPendiente = saldo.saldo_total_con_punitorios;
  // Suma de lo imputado + lo condonado
  const totalImputado = imputacion.monto_total + imputacion.condonacion_punitorios;
  // Tolerancia de 1 centavo por redondeo
  return Math.abs(totalImputado - totalPendiente) < 0.01;
}

/**
 * Monto mÃ­nimo a pagar en parcial: los punitorios devengados.
 * (Para que el cliente al menos pague los punitorios y desde HOY se
 * empiece a contar nuevo perÃ­odo)
 */
export function montoMinimoParcial(saldo: SaldoCuota, bonificacionPunitorios: number = 0): number {
  const totalPuni = saldo.punitorios_pendientes + saldo.iva_punitorios_pendientes;
  return Math.max(0, round(totalPuni - bonificacionPunitorios));
}

/**
 * Convierte una fecha a string YYYY-MM-DD, manejando tanto Date como string.
 * Resiste objetos Date que vienen de PostgreSQL (que .toString() no da formato ISO).
 */
export function toDateString(d: any): string {
  if (!d) return "";
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return "";
    // Componentes locales para evitar shift por UTC
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof d === 'string') {
    if (d.includes('T')) return d.split('T')[0];
    return d.substring(0, 10);
  }
  return "";
}

/**
 * Â¿La cuota se considera "vigente"? Vigente = vencida o del mes corriente.
 * Acepta fechaVto como Date, string ISO, o YYYY-MM-DD.
 */
export function esCuotaVigente(fechaVto: any, hoy: Date = new Date()): boolean {
  const vtoStr = toDateString(fechaVto);
  const hoyStr = toDateString(hoy);
  
  if (!vtoStr) return false;
  
  // Vencida: vto < hoy (comparaciÃ³n lexicogrÃ¡fica de YYYY-MM-DD funciona)
  if (vtoStr < hoyStr) return true;
  
  // Del mes corriente: mismos primeros 7 caracteres (YYYY-MM)
  if (vtoStr.substring(0, 7) === hoyStr.substring(0, 7)) return true;
  
  return false;
}
