/**
 * Arma el bloque "{compradores_bloque}" para el boleto.
 * 
 * Comportamiento:
 *  - 1 titular: "y por la otra, el/la seÃ±or/a NOMBRE, DNI..., ..., en adelante llamado 'EL COMPRADOR'"
 *  - 2+ titulares: "y por la otra, los seÃ±ores NOMBRE1, ...con un porcentaje del 50%; y NOMBRE2, ...con un porcentaje del 50%, y en adelante llamados 'LOS COMPRADORES'"
 *  - ConjugaciÃ³n por sexo cuando hay dato (domiciliado/domiciliada, Casado/Casada)
 *  - Personas jurÃ­dicas: "la firma RAZON SOCIAL, CUIT 30-..., con domicilio legal en ..., con un porcentaje del X%"
 *  - Datos faltantes: dejan placeholder amarillo Â«___Â» para completar en Word
 */

export type TitularDatos = {
  tipo: "FISICA" | "JURIDICA";
  nombre: string | null;
  apellido: string | null;
  razon_social: string | null;
  doc_numero: string | null;
  cuit: string | null;
  estado_civil: string | null;
  email: string | null;
  telefono: string | null;
  direccion_calle: string | null;
  direccion_numero: string | null;
  direccion_barrio: string | null;
  direccion_localidad: string | null;
  direccion_provincia: string | null;
  sexo: string | null;  // 'M' / 'F' o null
  porcentaje: number;
};

const FALTA = "[COMPLETAR]";  // marcador visible â€” el contador hace Ctrl+F para encontrar los faltantes

function s(v: string | null | undefined, fallback: string = FALTA): string {
  if (!v) return fallback;
  const t = String(v).trim();
  return t || fallback;
}

function fmtPct(p: number): string {
  // 50.00 â†’ "50%". 33.33 â†’ "33,33%"
  if (Math.abs(p - Math.round(p)) < 0.01) return `${Math.round(p)}%`;
  return `${p.toFixed(2).replace(".", ",")}%`;
}

function conjugarDomiciliado(sexo: string | null): string {
  if (sexo === "M") return "domiciliado";
  if (sexo === "F") return "domiciliada";
  return "domiciliado/a";
}

function conjugarEstadoCivil(ec: string | null, sexo: string | null): string {
  if (!ec) return FALTA;
  const limpio = ec.replace(/\/a$/i, "").trim(); // "Casado/a" â†’ "Casado", "Soltero/a" â†’ "Soltero"
  if (sexo === "M") return limpio;
  if (sexo === "F") {
    // Casado â†’ Casada, Soltero â†’ Soltera, etc.
    if (limpio.endsWith("o")) return limpio.slice(0, -1) + "a";
    if (limpio.toLowerCase() === "viudo") return "Viuda";
    return limpio; // ej: "Divorciado/a" original ya viene femenino o irregular
  }
  return ec; // sin sexo, dejamos el original con /a
}

function articuloPersona(sexo: string | null): string {
  if (sexo === "M") return "el seÃ±or";
  if (sexo === "F") return "la seÃ±ora";
  return "el/la seÃ±or/a";
}

function armarDireccion(t: TitularDatos): string {
  const calle = t.direccion_calle ? `${t.direccion_calle}${t.direccion_numero ? " " + t.direccion_numero : ""}` : FALTA;
  return calle;
}

function bloqueFisica(t: TitularDatos, esMultiple: boolean): string {
  const articulo = articuloPersona(t.sexo);
  const nombreCompleto = [t.apellido, t.nombre].filter(Boolean).join(", ") || FALTA;
  const partes: string[] = [];
  partes.push(`${articulo} ${nombreCompleto}`);
  partes.push(`DNI ${s(t.doc_numero)}`);
  if (t.cuit) partes.push(`CUIL ${t.cuit}`);
  partes.push(`Estado Civil ${conjugarEstadoCivil(t.estado_civil, t.sexo)}`);
  if (t.email) partes.push(`Correo ElectrÃ³nico ${t.email}`);
  if (t.telefono) partes.push(`TelÃ©fono Celular ${t.telefono}`);
  partes.push(`${conjugarDomiciliado(t.sexo)} en ${armarDireccion(t)}`);
  if (t.direccion_barrio) partes.push(`Barrio ${t.direccion_barrio}`);
  partes.push(`localidad de ${s(t.direccion_localidad)}`);
  partes.push(`Provincia de ${s(t.direccion_provincia)}`);
  if (esMultiple) {
    partes.push(`con un porcentaje del ${fmtPct(t.porcentaje)}`);
  }
  return partes.join(", ");
}

function bloqueJuridica(t: TitularDatos, esMultiple: boolean): string {
  const partes: string[] = [];
  partes.push(`la firma ${s(t.razon_social)}`);
  partes.push(`CUIT ${s(t.cuit)}`);
  partes.push(`con domicilio legal en ${armarDireccion(t)}`);
  if (t.direccion_localidad) partes.push(`localidad de ${t.direccion_localidad}`);
  if (t.direccion_provincia) partes.push(`Provincia de ${t.direccion_provincia}`);
  if (esMultiple) {
    partes.push(`con un porcentaje del ${fmtPct(t.porcentaje)}`);
  }
  return partes.join(", ");
}

function bloqueTitular(t: TitularDatos, esMultiple: boolean): string {
  return t.tipo === "JURIDICA" ? bloqueJuridica(t, esMultiple) : bloqueFisica(t, esMultiple);
}

/**
 * FunciÃ³n principal: arma el texto completo a inyectar en {compradores_bloque}
 */
export function armarCompradoresBloque(titulares: TitularDatos[]): string {
  if (titulares.length === 0) return "y por la otra, " + FALTA;
  
  // Ordenar por porcentaje desc (el de mayor primero, si todos 100 se mantiene orden)
  // Pero para preservar orden definido en BD, dejamos como vienen
  
  if (titulares.length === 1) {
    return `y por la otra, ${bloqueTitular(titulares[0], false)}, y en adelante llamado "EL COMPRADOR"`;
  }
  
  // 2+ titulares: "los seÃ±ores X..., con un %; y Y..., con un %; ...y en adelante llamados 'LOS COMPRADORES'"
  // Cambiamos "el/la seÃ±or/a" del primero por "los seÃ±ores"
  const primero = bloqueTitular(titulares[0], true).replace(/^(el\/la seÃ±or\/a|el seÃ±or|la seÃ±ora)\s/, "los seÃ±ores ");
  const restoArmado: string[] = [];
  for (let i = 1; i < titulares.length; i++) {
    restoArmado.push(bloqueTitular(titulares[i], true));
  }
  
  // Unir: primero; y segundo; y tercero, y en adelante llamados
  let bloque = primero;
  for (let i = 0; i < restoArmado.length; i++) {
    const esUltimo = i === restoArmado.length - 1;
    bloque += "; y " + restoArmado[i];
    if (esUltimo) {
      bloque += `, y en adelante llamados "LOS COMPRADORES"`;
    }
  }
  
  return `y por la otra, ${bloque}`;
}
