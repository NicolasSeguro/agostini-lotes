/**
 * Score de mora portado del SGP CuotaFacil.
 * Heuristica fija (no es un modelo predictivo): estadio 40% + historial 30%
 * + antiguedad de vencimiento 15% + stress macro 15%.
 */

export const MACRO_DEFAULT = { ipc: 3.7, cac: 2.3, desempleo: 6.3 };

export type MoraInput = {
  cuotasVencidas: number;
  historialMora: number; // 0..1
  diasVencidoMasAntiguo: number;
  macro?: { ipc: number; cac: number; desempleo: number };
};

export function calcularScoreMora(input: MoraInput): number {
  const e = Math.max(0, Math.floor(input.cuotasVencidas || 0));
  const hist = Math.min(1, Math.max(0, input.historialMora || 0));
  const dias = Math.max(0, input.diasVencidoMasAntiguo || 0);
  const macro = input.macro || MACRO_DEFAULT;

  const pEstadio = Math.min(e / 6, 1) * 40;
  const pHist = hist * 30;
  const pAntig = Math.min(dias / 180, 1) * 15;
  const macroStress =
    (macro.ipc * 0.4 + macro.cac * 0.4 + (macro.desempleo / 10) * 0.2) / 10;
  const pMacro = Math.min(macroStress, 1) * 15;

  let score = Math.min(pEstadio + pHist + pAntig + pMacro, 100);
  if (e >= 5) score = Math.max(score, 80);
  else if (e >= 4) score = Math.max(score, 65);
  else if (e >= 3) score = Math.max(score, 50);
  else if (e >= 2) score = Math.max(score, 35);
  else if (e >= 1) score = Math.max(score, 20);

  return Math.min(Math.round(score), 99);
}

export function estadioMora(cuotasVencidas: number): number {
  return Math.min(6, Math.max(0, Math.floor(cuotasVencidas || 0)));
}
