// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CÃLCULO DE VENTAS - LÃ“GICA CENTRAL (con Convenios)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
// ORDEN de cÃ¡lculo:
//   Precio Lista
//     âˆ’ Descuento Convenio       (% del precio lista o monto fijo)
//     = Subtotal con Convenio
//     âˆ’ Descuento Financiero     (% sobre Subtotal con Convenio)
//     = Precio Boleto
//       âˆ’ Anticipo
//       = Monto a Financiar
//       Ã· Cant Cuotas (con interÃ©s si FrancÃ©s)
//       = Cuota Base
//
// TOPE descuento financiero: % del Subtotal con Convenio (no del precio lista).
//
// DESCOMPOSICIÃ“N IVA del precio boleto:
//   gravado_con_iva = precio_boleto Ã— porc_gravado
//   exento_total   = precio_boleto Ã— (1 - porc_gravado)
//   capital_gr_neto = gravado_con_iva / (1 + IVA_RATE)
//   iva_capital    = gravado_con_iva - capital_gr_neto
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const IVA_RATE = 0.21;

export type ConvenioAplicado = {
  tipo_beneficio: "PORCENTAJE" | "MONTO_FIJO";
  valor_beneficio: number;
};

export type CondicionesVenta = {
  precio_lista: number;
  desc_financiero: number;       // monto $ (lo que ingresa el form)
  desc_comercial: number;        // monto $ (reclasificaciÃ³n post-autorizaciÃ³n)
  anticipo: number;
  cant_cuotas: number;
  sistema_amort: "FRANCES" | "AJUSTABLE";
  tasa_interes_mensual: number;
  fecha_primer_vto: string;
  convenio?: ConvenioAplicado | null; // NUEVO opcional
};

export type CalculoVenta = {
  // Nuevo: descuento de convenio calculado
  descuento_convenio: number;
  subtotal_con_convenio: number;
  
  // CÃ¡lculos finales (igual que antes)
  precio_boleto: number;
  monto_a_financiar: number;
  cuota_base: number;
  capital_gr_total: number;
  capital_ex_total: number;
  iva_capital_total: number;
  
  // Validaciones
  desc_financiero_pct: number;       // % sobre subtotal con convenio
  excede_tope_desc: boolean;
  error_convenio_excede_lista: boolean; // monto fijo > precio lista
};

/**
 * Calcula el descuento del convenio sobre el precio lista.
 * Retorna 0 si no hay convenio.
 */
export function calcularDescuentoConvenio(precio_lista: number, convenio?: ConvenioAplicado | null): number {
  if (!convenio || !precio_lista || precio_lista <= 0) return 0;
  if (convenio.tipo_beneficio === "PORCENTAJE") {
    return round(precio_lista * (convenio.valor_beneficio / 100));
  } else {
    return round(convenio.valor_beneficio);
  }
}

export function calcularVenta(
  cond: CondicionesVenta,
  porc_gravado: number,
  tope_desc_pct: number
): CalculoVenta {
  const precio_lista = Math.max(0, cond.precio_lista || 0);
  const desc_financiero = Math.max(0, cond.desc_financiero || 0);
  const desc_comercial = Math.max(0, cond.desc_comercial || 0);
  const anticipo = Math.max(0, cond.anticipo || 0);

  // 1) Descuento de convenio
  const descuento_convenio = calcularDescuentoConvenio(precio_lista, cond.convenio);
  
  // Validar: monto fijo del convenio no puede superar precio lista
  const error_convenio_excede_lista = 
    !!cond.convenio &&
    cond.convenio.tipo_beneficio === "MONTO_FIJO" &&
    descuento_convenio > precio_lista;

  // 2) Subtotal con convenio (precio lista menos descuento convenio)
  const subtotal_con_convenio = round(Math.max(0, precio_lista - descuento_convenio));
  
  // 3) Precio boleto = Subtotal con convenio - Desc Financiero - Desc Comercial
  const precio_boleto = round(Math.max(0, subtotal_con_convenio - desc_financiero - desc_comercial));
  
  // 4) Monto a financiar
  const monto_a_financiar = round(precio_boleto - anticipo);
  
  // 5) Cuota base
  let cuota_base = 0;
  if (cond.cant_cuotas > 0 && monto_a_financiar > 0) {
    if (cond.sistema_amort === "AJUSTABLE") {
      cuota_base = round(monto_a_financiar / cond.cant_cuotas);
    } else if (cond.sistema_amort === "FRANCES") {
      const i = (cond.tasa_interes_mensual || 0) / 100;
      if (i === 0) {
        cuota_base = round(monto_a_financiar / cond.cant_cuotas);
      } else {
        const factor = (1 - Math.pow(1 + i, -cond.cant_cuotas));
        cuota_base = factor > 0 ? round(monto_a_financiar * i / factor) : 0;
      }
    }
  }
  
  // 6) DescomposiciÃ³n IVA del precio boleto
  const gravado_con_iva = round(precio_boleto * porc_gravado);
  const capital_ex_total = round(precio_boleto * (1 - porc_gravado));
  const capital_gr_total = round(gravado_con_iva / (1 + IVA_RATE));
  const iva_capital_total = round(gravado_con_iva - capital_gr_total);
  
  // 7) Tope descuento financiero â€” sobre SUBTOTAL CON CONVENIO (cambio respecto a v1)
  const desc_financiero_pct = subtotal_con_convenio > 0 ? desc_financiero / subtotal_con_convenio : 0;
  const excede_tope_desc = desc_financiero_pct > tope_desc_pct + 0.00001;
  
  return {
    descuento_convenio,
    subtotal_con_convenio,
    precio_boleto,
    monto_a_financiar,
    cuota_base,
    capital_gr_total,
    capital_ex_total,
    iva_capital_total,
    desc_financiero_pct,
    excede_tope_desc,
    error_convenio_excede_lista,
  };
}

export function defaultFechaPrimerVto(hoy: Date = new Date()): string {
  const mesSig = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 10);
  const yyyy = mesSig.getFullYear();
  const mm = String(mesSig.getMonth() + 1).padStart(2, '0');
  const dd = String(mesSig.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export type CuotaPreview = {
  numero: number;
  fecha_vto: string;
  monto: number;
};

export function previewPlan(
  cant_cuotas: number,
  cuota_base: number,
  fecha_primer_vto: string
): CuotaPreview[] {
  const cuotas: CuotaPreview[] = [];
  const primerVto = new Date(fecha_primer_vto + "T00:00:00");
  for (let i = 0; i < cant_cuotas; i++) {
    const fecha = new Date(primerVto.getFullYear(), primerVto.getMonth() + i, primerVto.getDate());
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    cuotas.push({ numero: i + 1, fecha_vto: `${yyyy}-${mm}-${dd}`, monto: cuota_base });
  }
  return cuotas;
}

export function porcentajesEquitativos(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [100];
  const base = Math.floor(10000 / n) / 100;
  const pcts = Array(n - 1).fill(base);
  const ultimo = round(100 - base * (n - 1));
  pcts.push(ultimo);
  return pcts;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
