"use client";

import { useState, useEffect, ChangeEvent } from "react";

/**
 * Input numÃ©rico con formato Argentino:
 *   - punto "." = separador de miles
 *   - coma "," = separador decimal
 *
 * Ejemplos vÃ¡lidos al tipear:
 *   "10000000"        â†’ muestra "10.000.000"
 *   "10000000,5"      â†’ muestra "10.000.000,5"
 *   "10000000,50"     â†’ muestra "10.000.000,50"
 *   "10.000.000"      â†’ muestra "10.000.000"   (mantiene formato)
 *
 * Internamente trabaja con number puro.
 */
export function MoneyInput({
  value,
  onChange,
  className = "",
  placeholder,
  disabled,
  autoFocus,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [display, setDisplay] = useState<string>(() => numberToDisplay(value));
  const [focused, setFocused] = useState(false);

  // Cuando cambia value desde afuera y NO estÃ¡ focuseado, sync el display
  useEffect(() => {
    if (!focused) {
      setDisplay(numberToDisplay(value));
    }
  }, [value, focused]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    
    if (raw === "") {
      setDisplay("");
      onChange("");
      return;
    }
    
    // 1) Quitar todo lo que no sea dÃ­gito, punto o coma
    let cleaned = raw.replace(/[^\d.,]/g, "");
    
    // 2) Quitar todos los puntos (son separadores de miles, no aportan valor)
    let sinPuntos = cleaned.replace(/\./g, "");
    
    // 3) Si hay mÃ¡s de una coma, dejar solo la primera
    const coma = sinPuntos.indexOf(",");
    if (coma !== -1) {
      sinPuntos = sinPuntos.substring(0, coma + 1) + sinPuntos.substring(coma + 1).replace(/,/g, "");
    }
    
    // 4) Convertir a nÃºmero: cambiar la coma por punto (formato JS)
    const paraNumero = sinPuntos.replace(",", ".");
    const num = parseFloat(paraNumero);
    
    if (isNaN(num)) {
      setDisplay(cleaned);
      onChange("");
      return;
    }
    
    // 5) Formatear de vuelta para mostrar: parte entera con puntos, parte decimal tal cual
    const [parteEntera, parteDecimal] = sinPuntos.split(",");
    
    // La parte entera puede tener un cero al inicio o estar vacÃ­a
    let enteroFormateado = "";
    if (parteEntera === "" || parteEntera === undefined) {
      enteroFormateado = "0";
    } else {
      // Quitar ceros al inicio (excepto si es solo "0")
      const enteroLimpio = parteEntera.replace(/^0+(?=\d)/, "") || "0";
      const enteroNum = parseInt(enteroLimpio, 10);
      enteroFormateado = isNaN(enteroNum) ? "0" : enteroNum.toLocaleString("es-AR");
    }
    
    // Reconstruir el display
    let nuevoDisplay = enteroFormateado;
    if (sinPuntos.includes(",")) {
      // Conservar la parte decimal tal como el usuario la estÃ¡ escribiendo
      nuevoDisplay = enteroFormateado + "," + (parteDecimal || "");
    }
    
    setDisplay(nuevoDisplay);
    onChange(num);
  }

  function handleBlur() {
    setFocused(false);
    setDisplay(numberToDisplay(value));
  }

  function handleFocus() {
    setFocused(true);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      className={className}
    />
  );
}

/**
 * Convierte un number a string formateado en estilo Argentino.
 * 10000000      â†’ "10.000.000"
 * 10000000.5    â†’ "10.000.000,5"
 * 10000000.50   â†’ "10.000.000,50"
 */
function numberToDisplay(v: number | ""): string {
  if (v === "" || v === null || v === undefined) return "";
  if (typeof v !== "number" || isNaN(v)) return "";
  if (v % 1 === 0) {
    return v.toLocaleString("es-AR");
  }
  return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
