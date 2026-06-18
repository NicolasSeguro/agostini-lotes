"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";

export function BotonAnularCobranza({
  cobranzaId,
  tenant,
}: {
  cobranzaId: string;
  tenant: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnular() {
    if (reason.trim().length < 3) {
      setError("Ingresá un motivo (mínimo 3 caracteres)");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/cobranzas/${cobranzaId}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al anular");
        setSubmitting(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error de conexión");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
      >
        <XCircle size={16} />
        Anular
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Anular cobranza
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Esta acción marca la cobranza como ANULADA y reactiva las cuotas
              imputadas para que vuelvan a estar pendientes. No se borra del sistema.
            </p>
            <div className="mb-4">
              <label className="text-xs text-slate-500 mb-1 block">
                Motivo de la anulación *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Ej: Error de carga, cheque rechazado, etc."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            {error && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleAnular}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {submitting ? "Anulando..." : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
