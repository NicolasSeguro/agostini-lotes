/**
 * ConversiÃ³n de nÃºmeros a letras (espaÃ±ol Argentina).
 * Para boletos de compraventa: importes en pesos.
 * Soporta hasta billones.
 */

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const ESPECIALES = {
  10: "DIEZ", 11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE",
  16: "DIECISÃ‰IS", 17: "DIECISIETE", 18: "DIECIOCHO", 19: "DIECINUEVE",
  20: "VEINTE", 21: "VEINTIUNO", 22: "VEINTIDÃ“S", 23: "VEINTITRÃ‰S", 24: "VEINTICUATRO",
  25: "VEINTICINCO", 26: "VEINTISÃ‰IS", 27: "VEINTISIETE", 28: "VEINTIOCHO", 29: "VEINTINUEVE",
} as Record<number, string>;
const DECENAS = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
                  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function centenasALetras(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (ESPECIALES[resto]) {
      partes.push(ESPECIALES[resto]);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (d > 0 && u > 0) partes.push(`${DECENAS[d]} Y ${UNIDADES[u]}`);
      else if (d > 0) partes.push(DECENAS[d]);
      else if (u > 0) partes.push(UNIDADES[u]);
    }
  }
  return partes.join(" ");
}

function milesALetras(n: number): string {
  // 0 a 999.999
  if (n === 0) return "";
  if (n < 1000) return centenasALetras(n);
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  let parteMiles: string;
  if (miles === 1) parteMiles = "MIL";
  else parteMiles = centenasALetras(miles) + " MIL";
  if (resto === 0) return parteMiles;
  return parteMiles + " " + centenasALetras(resto);
}

export function numeroALetras(n: number): string {
  if (n === 0) return "CERO";
  if (n < 0) return "MENOS " + numeroALetras(Math.abs(n));
  
  const entero = Math.floor(n);
  
  // Millones
  if (entero < 1000000) {
    return milesALetras(entero);
  }
  if (entero < 1_000_000_000) {
    const millones = Math.floor(entero / 1_000_000);
    const resto = entero % 1_000_000;
    let parteM: string;
    if (millones === 1) parteM = "UN MILLÃ“N";
    else parteM = milesALetras(millones) + " MILLONES";
    if (resto === 0) return parteM;
    return parteM + " " + milesALetras(resto);
  }
  // Miles de millones (mil millones = "mil millones")
  if (entero < 1_000_000_000_000) {
    const milesM = Math.floor(entero / 1_000_000_000);
    const resto = entero % 1_000_000_000;
    let parteMM: string;
    if (milesM === 1) parteMM = "MIL MILLONES";
    else parteMM = milesALetras(milesM) + " MIL MILLONES";
    if (resto === 0) return parteMM;
    return parteMM + " " + numeroALetras(resto);
  }
  return entero.toString(); // fallback
}

/** Convierte un monto en pesos a letras, con la frase "PESOS ARGENTINOS" */
export function montoALetras(n: number): string {
  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  let resultado = "PESOS " + numeroALetras(entero);
  if (centavos > 0) {
    resultado += " CON " + numeroALetras(centavos).toLowerCase().toUpperCase() + " CENTAVOS";
  }
  return resultado;
}

/** Formato de nÃºmero con separadores AR: 35000000 â†’ "35.000.000" */
export function formatNumero(n: number, decimales = 0): string {
  return Number(n).toLocaleString("es-AR", { 
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Formato de fecha YYYY-MM-DD o Date â†’ "DD/MM/YYYY" */
export function formatFecha(fecha: string | Date | null): string {
  if (!fecha) return "";
  const d = typeof fecha === "string" ? new Date(fecha + (fecha.length === 10 ? "T00:00:00" : "")) : fecha;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

/** DÃ­a del mes con guiÃ³n "10" */
export function diaDelMes(fecha: string | Date | null): string {
  if (!fecha) return "";
  const d = typeof fecha === "string" ? new Date(fecha + (fecha.length === 10 ? "T00:00:00" : "")) : fecha;
  return String(d.getDate());
}
