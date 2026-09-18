import { formatMoney } from "@/lib/utils";
import type { OpsSnapshot } from "@/lib/ops-snapshot";

export function responderAsistente(pregunta: string, snap: OpsSnapshot): string {
  const q = pregunta.trim().toLowerCase();
  const moraTxt = snap.moraClientes
    .map(
      (c) =>
        `• ${c.cliente}: ${c.cuotas} cuotas vencidas, ${c.dias} días, saldo ${formatMoney(c.saldo)}`
    )
    .join("\n");

  if (/mora|vencid|atras|score/.test(q)) {
    if (!snap.moraClientes.length) {
      return "En este fideicomiso no hay cuotas vencidas ahora. La cartera está al día.";
    }
    return `Hay ${snap.cuotasVencidas} cuotas vencidas. Prioridad de mora:\n\n${moraTxt}\n\nEl score es la heurística del SGP (estadio + historial + antigüedad). No decide solo: sugiere a quién llamar primero.`;
  }

  if (/espera|pendiente|autoriz|laura|contabil/.test(q)) {
    return [
      `Pendientes de decisión en ${snap.tenant}:`,
      `• ${snap.enCarga} venta${snap.enCarga === 1 ? "" : "s"} en carga (faltan datos o autorización comercial)`,
      `• ${snap.autorizadas} autorizada${snap.autorizadas === 1 ? "" : "s"} esperando contabilidad`,
      `• ${snap.reintegros} reintegro${snap.reintegros === 1 ? "" : "s"} de rescisión`,
      `• ${snap.rechazadas} rechazada${snap.rechazadas === 1 ? "" : "s"}`,
    ].join("\n");
  }

  if (/lote|stock|disponib/.test(q)) {
    return `Stock de ${snap.tenant}: ${snap.lotesDisponibles} lotes disponibles y ${snap.lotesVendidos} vendidos. El stock público para Rosario usa la API /api/public/lotes.`;
  }

  if (/cobr|recaud|ingreso|caja/.test(q)) {
    return `Este mes se registraron ${formatMoney(snap.cobradoMes)} en cobranzas confirmadas. El saldo vencido (cuotas impagas) es ${formatMoney(snap.saldoPendiente)}.`;
  }

  if (/rechaz/.test(q)) {
    return snap.rechazadas
      ? `Hay ${snap.rechazadas} venta(s) rechazada(s) en el circuito comercial o de contabilidad. Abrí Ventas → Rechazadas para el motivo.`
      : "No hay ventas rechazadas en este fideicomiso.";
  }

  if (/reinteg|rescis/.test(q)) {
    return snap.reintegros
      ? `Hay ${snap.reintegros} operación(es) en pendiente de reintegro. Caja las lista para devolver el anticipo neteable.`
      : "No hay reintegros pendientes.";
  }

  if (/persona|cliente|comprador/.test(q)) {
    return `Hay ${snap.personas} personas cargadas en ${snap.tenant}. ${snap.moraClientes.length} aparecen en mora.`;
  }

  return [
    `Resumen de ${snap.tenant}:`,
    `• ${snap.lotesDisponibles} lotes disponibles · ${snap.ventas} ventas`,
    `• ${snap.enCarga} en carga · ${snap.autorizadas} para contabilizar · ${snap.reintegros} reintegro`,
    `• ${snap.cuotasVencidas} cuotas vencidas · saldo ${formatMoney(snap.saldoPendiente)}`,
    `• Cobrado este mes: ${formatMoney(snap.cobradoMes)}`,
    snap.moraClientes.length ? `\nMora prioritaria:\n${moraTxt}` : "",
    `\nPuedo contarte mora, pendientes, stock, cobranzas o rechazos. El motor de cálculo de cuotas no se toca: yo solo leo la operación.`,
  ]
    .filter(Boolean)
    .join("\n");
}
