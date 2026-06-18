"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/utils";

type Cuota = {
  id: string;
  numero: number;
  fecha_vto: string;
  estado: string;
  capital_gr_orig: number;
  capital_ex_orig: number;
  iva_capital_orig: number;
  interes_gr_orig: number;
  interes_ex_orig: number;
  iva_interes_orig: number;
  fecha_pago: string | null;
};

type Venta = {
  id: string;
  fecha: string;
  estado: string;
  precio_total: number;
  cant_cuotas: number;
  cuota_base: number;
  indice_ajuste: string;
  sistema_amort: string;
  lote_numero: string;
  proyecto_nombre: string;
  cuotas_pendientes: number;
  cuotas_pagas: number;
  cuotas_vencidas: number;
  cuotas: Cuota[];
};

function getEstadoVentaStyle(estado: string) {
  const map: Record<string, string> = {
    BOLETO: "bg-green-100 text-green-700",
    ESCRITURADA: "bg-blue-100 text-blue-700",
    RESCINDIDA: "bg-red-100 text-red-700",
    CEDIDA: "bg-amber-100 text-amber-700",
  };
  return map[estado] || "bg-slate-100 text-slate-700";
}

function getEstadoCuotaStyle(estado: string) {
  const map: Record<string, { label: string; color: string; icon: any }> = {
    PAGA: { label: "Paga", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
    EMITIDA: { label: "Emitida", color: "bg-slate-100 text-slate-700", icon: Clock },
    MORA: { label: "Mora", color: "bg-red-100 text-red-700", icon: AlertCircle },
    PAGA_PARCIAL: { label: "Paga parcial", color: "bg-amber-100 text-amber-700", icon: Clock },
    ANULADA: { label: "Anulada", color: "bg-slate-100 text-slate-500", icon: Clock },
  };
  return map[estado] || { label: estado, color: "bg-slate-100", icon: Clock };
}

export function VentaExpandible({ venta, tenant }: { venta: Venta; tenant: string }) {
  const [expanded, setExpanded] = useState(false);

  const saldoVenta = parseFloat(String(venta.cuota_base || 0)) * (venta.cuotas_pendientes || 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return (
    <div className={venta.cuotas_vencidas > 0 ? "bg-red-50/20" : ""}>
      {/* Resumen clickeable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-6 py-4 hover:bg-slate-50 transition"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 flex items-start gap-2">
            <div className="mt-0.5">
              {expanded ? (
                <ChevronDown size={18} className="text-slate-400" />
              ) : (
                <ChevronRight size={18} className="text-slate-400" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-medium text-slate-900">
                  {venta.proyecto_nombre} · Lote {venta.lote_numero}
                </div>
                {venta.cuotas_vencidas > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                    <AlertCircle size={12} />
                    {venta.cuotas_vencidas} en mora
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-500 mt-0.5">
                {formatDate(venta.fecha)} · {venta.sistema_amort}
                {venta.indice_ajuste !== "NINGUNO" && ` · Ajusta por ${venta.indice_ajuste}`}
              </div>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEstadoVentaStyle(venta.estado)}`}>
            {venta.estado}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mt-3 pl-7">
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Precio total</div>
            <div className="font-medium">{formatMoney(venta.precio_total)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Cuota actual</div>
            <div className="font-medium">{formatMoney(venta.cuota_base)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Cuotas (pagas / total)</div>
            <div className="font-medium">{venta.cuotas_pagas} / {venta.cant_cuotas}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Pendientes</div>
            <div className="font-medium">{venta.cuotas_pendientes}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Saldo ajustado</div>
            <div className="font-semibold text-brand-700">{formatMoney(saldoVenta)}</div>
          </div>
        </div>
      </button>

      {/* Plan de cuotas expandido */}
      {expanded && (
        <div className="px-6 pb-4 bg-slate-50/50">
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">Plan de cuotas</div>
              <Link
                href={`/ventas/${venta.id}?t=${tenant}`}
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
              >
                <ExternalLink size={12} />
                Abrir venta completa
              </Link>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Vencimiento</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Capital</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">IVA</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Total nominal</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Fecha pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {venta.cuotas.map((c) => {
                    const estStyle = getEstadoCuotaStyle(c.estado);
                    const Icon = estStyle.icon;
                    const capital = parseFloat(String(c.capital_gr_orig || 0)) + parseFloat(String(c.capital_ex_orig || 0));
                    const iva = parseFloat(String(c.iva_capital_orig || 0)) + parseFloat(String(c.iva_interes_orig || 0));
                    const interes = parseFloat(String(c.interes_gr_orig || 0)) + parseFloat(String(c.interes_ex_orig || 0));
                    const total = capital + iva + interes;
                    const vencida = c.estado !== "PAGA" && c.estado !== "ANULADA" && new Date(c.fecha_vto) < hoy;

                    return (
                      <tr key={c.id} className={vencida ? "bg-red-50/40" : ""}>
                        <td className="px-3 py-1.5 text-slate-900 font-medium">{c.numero}</td>
                        <td className="px-3 py-1.5 text-slate-700">
                          {formatDate(c.fecha_vto)}
                          {vencida && (
                            <span className="ml-1.5 text-xs text-red-600 font-medium">vencida</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${estStyle.color}`}>
                            <Icon size={11} />
                            {estStyle.label}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{formatMoney(capital)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{formatMoney(iva)}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-900">{formatMoney(total)}</td>
                        <td className="px-3 py-1.5 text-slate-500 text-xs">
                          {c.fecha_pago ? formatDate(c.fecha_pago) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
