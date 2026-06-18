"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, AlertCircle, CheckCircle2, X } from "lucide-react";

const INDICES = [
  { value: "CAC", label: "CAC" },
  { value: "CVS", label: "CVS" },
  { value: "UVA", label: "UVA" },
  { value: "IPC", label: "IPC" },
  { value: "USD_OFICIAL", label: "USD Oficial" },
];

type Props = {
  ventaId: string;
  tenant: string;
  /**
   * Identificacion visual de la venta (ej: "L-12-A" o numero corto).
   * Solo para mostrar en el modal de confirmacion.
   */
  ventaLabel?: string;
};

export function AsignarIndiceButton({ ventaId, tenant, ventaLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [indice, setIndice] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setIndice("");
    setError(null);
    setSubmitting(false);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    reset();
  }

  async function handleSubmit() {
    setError(null);
    if (!indice) {
      setError("Eligi un indice antes de continuar.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/ventas/${ventaId}/asignar-indice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          indice_ajuste: indice,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Error al asignar el indice");
        setSubmitting(false);
        return;
      }
      // Exito: cerrar modal y refrescar el listado
      setOpen(false);
      reset();
      router.refresh();
    } catch (err: any) {
      setError("Error de red: " + err.message);
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center gap-1 text-xs font-medium bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 px-2 py-1 rounded transition whitespace-nowrap"
        title="Asignar indice de ajuste a esta venta"
      >
        <Sparkles size={12} />
        Asignar indice
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Sparkles className="text-amber-600" size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Asignar indice</h2>
                  {ventaLabel && (
                    <p className="text-xs text-slate-500 mt-0.5">Venta: {ventaLabel}</p>
                  )}
                </div>
              </div>
              <button
                onClick={close}
                disabled={submitting}
                className="text-slate-400 hover:text-slate-600 transition"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-slate-600 mb-4 text-sm">
              Eligi el indice que corresponde a esta venta. Esta accion no modifica
              las cuotas existentes.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Indice de ajuste <span className="text-rose-600">*</span>
              </label>
              <select
                value={indice}
                onChange={(e) => setIndice(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="">-- Seleccionar --</option>
                {INDICES.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                <div className="text-emerald-800 leading-relaxed">
                  <div className="font-medium mb-1">Operacion segura</div>
                  <ul className="list-disc list-inside text-xs space-y-0.5 ml-1">
                    <li>Las cuotas existentes mantienen su monto actual</li>
                    <li>Los proximos ajustes del indice elegido se aplicaran a esta venta</li>
                    <li>La operacion queda registrada en el historial</li>
                  </ul>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm mb-4 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={close}
                disabled={submitting}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !indice}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60"
              >
                {submitting ? "Asignando..." : "Asignar indice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
