import { calcularVenta, calcularDescuentoConvenio, previewPlan } from "../src/lib/venta-calc";
import {
  calcularSaldoCuota,
  calcularImputacion,
  TASA_PUNITORIA_DIARIA,
} from "../src/lib/cobranza-calc";
import { calcularScoreMora } from "../src/lib/mora-score";

describe("venta-calc", () => {
  it("aplica convenio porcentual antes del descuento financiero", () => {
    const calc = calcularVenta(
      {
        precio_lista: 100000,
        desc_financiero: 5000,
        desc_comercial: 0,
        anticipo: 10000,
        cant_cuotas: 10,
        sistema_amort: "AJUSTABLE",
        tasa_interes_mensual: 0,
        fecha_primer_vto: "2026-10-10",
        convenio: { tipo_beneficio: "PORCENTAJE", valor_beneficio: 10 },
      },
      1,
      0.1
    );
    expect(calc.descuento_convenio).toBe(10000);
    expect(calc.subtotal_con_convenio).toBe(90000);
    expect(calc.precio_boleto).toBe(85000);
    expect(calc.monto_a_financiar).toBe(75000);
    expect(calc.cuota_base).toBe(7500);
  });

  it("aplica convenio de monto fijo y marca tope de desc financiero", () => {
    const calc = calcularVenta(
      {
        precio_lista: 200000,
        desc_financiero: 30000,
        desc_comercial: 0,
        anticipo: 0,
        cant_cuotas: 12,
        sistema_amort: "AJUSTABLE",
        tasa_interes_mensual: 0,
        fecha_primer_vto: "2026-10-10",
        convenio: { tipo_beneficio: "MONTO_FIJO", valor_beneficio: 20000 },
      },
      0.5,
      0.1
    );
    expect(calcularDescuentoConvenio(200000, { tipo_beneficio: "MONTO_FIJO", valor_beneficio: 20000 })).toBe(20000);
    expect(calc.excede_tope_desc).toBe(true);
    expect(calc.capital_gr_total + calc.capital_ex_total + calc.iva_capital_total).toBeCloseTo(calc.precio_boleto, 1);
  });

  it("calcula sistema frances y preview de cuotas", () => {
    const calc = calcularVenta(
      {
        precio_lista: 120000,
        desc_financiero: 0,
        desc_comercial: 0,
        anticipo: 20000,
        cant_cuotas: 12,
        sistema_amort: "FRANCES",
        tasa_interes_mensual: 1,
        fecha_primer_vto: "2026-10-10",
      },
      1,
      0.15
    );
    expect(calc.cuota_base).toBeGreaterThan(0);
    const plan = previewPlan(12, calc.cuota_base, "2026-10-10");
    expect(plan).toHaveLength(12);
    expect(plan[0].fecha_vto).toBe("2026-10-10");
  });
});

describe("cobranza-calc", () => {
  const cuota = {
    id: "c1",
    numero: 1,
    fecha_vto: "2026-01-10",
    estado: "MORA",
    cuota_base_actual: 12100,
    capital_gr_orig: 10000,
    capital_ex_orig: 0,
    iva_capital_orig: 2100,
    interes_gr_orig: 0,
    interes_ex_orig: 0,
    iva_interes_orig: 0,
  };

  it("imputa punitorios antes que capital", () => {
    const saldo = calcularSaldoCuota(cuota, [], new Date("2026-01-20T12:00:00"));
    expect(saldo.dias_vencidos).toBe(10);
    expect(saldo.punitorios_pendientes + saldo.iva_punitorios_pendientes).toBeGreaterThan(0);
    expect(TASA_PUNITORIA_DIARIA).toBe(0.004);

    const imp = calcularImputacion(saldo, 400);
    expect(imp.monto_punitorios + imp.iva_punitorios).toBeGreaterThan(0);
    expect(imp.monto_capital).toBe(0);
  });

  it("permite revertir conceptualmente un saldo ya pagado", () => {
    const saldo = calcularSaldoCuota(
      cuota,
      [
        {
          fecha: "2026-01-15",
          monto_capital: 10000,
          monto_iva: 2100,
          monto_interes: 0,
          monto_ajuste: 0,
          monto_punitorios: 0,
          condonacion_punitorios: 0,
          iva_capital: 2100,
          iva_interes: 0,
          iva_ajuste: 0,
          iva_punitorios: 0,
        },
      ],
      new Date("2026-01-20T12:00:00")
    );
    expect(saldo.capital_pendiente).toBe(0);
  });
});

describe("mora-score", () => {
  it("fuerza piso 80 desde estadio 5", () => {
    expect(
      calcularScoreMora({
        cuotasVencidas: 5,
        historialMora: 0,
        diasVencidoMasAntiguo: 0,
        macro: { ipc: 0, cac: 0, desempleo: 0 },
      })
    ).toBeGreaterThanOrEqual(80);
  });
});
