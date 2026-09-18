/**
 * Valida un CUIT argentino (algoritmo de dígito verificador estándar).
 * Acepta formatos: "20-12345678-9", "20123456789", "20.12345678.9"
 */
export function validarCuit(cuit: string): { valido: boolean; cuitNormalizado: string; error?: string } {
  if (!cuit) return { valido: false, cuitNormalizado: "", error: "CUIT vacío" };
  
  // Limpiar separadores
  const limpio = cuit.replace(/[^0-9]/g, "");
  
  if (limpio.length !== 11) {
    return { valido: false, cuitNormalizado: limpio, error: "El CUIT debe tener 11 dígitos" };
  }
  
  // Algoritmo de dígito verificador
  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(limpio[i]) * factores[i];
  }
  const resto = suma % 11;
  let dv: number;
  if (resto === 0) dv = 0;
  else if (resto === 1) {
    // Caso especial: no es válido
    return { valido: false, cuitNormalizado: limpio, error: "CUIT inválido (caso 1)" };
  } else {
    dv = 11 - resto;
  }
  
  const dvCargado = parseInt(limpio[10]);
  
  if (dv !== dvCargado) {
    return { valido: false, cuitNormalizado: limpio, error: `Dígito verificador incorrecto (esperado: ${dv})` };
  }
  
  return { valido: true, cuitNormalizado: limpio };
}

/**
 * Formatea un CUIT al formato canónico XX-XXXXXXXX-X
 */
export function formatearCuit(cuit: string): string {
  const limpio = cuit.replace(/[^0-9]/g, "");
  if (limpio.length !== 11) return cuit;
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`;
}
