"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, X, AlertTriangle } from "lucide-react";

type Reintegro = {
  id: string;
  nro: number;
  solicitud_reintegro_motivo: string;
  solicitud_reintegro_at: string;
  lote_numero: string;
  lote_manzana: string | null;
  proyecto_nombre: string;
  comprador: string;
  persona_id: string;
  cobranzas_count: number;
  monto_total_reintegrar: number;
};

function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(d: string): string {
  try { return new Date(d).toLocaleString("es-AR"); } catch { return d; }
}

export function ReintegrosLista({ tenant, reintegros }: { tenant: string; reintegros: Reintegro[] }) {
  const router = useRouter();
  const [accion, setAccion] = useState<null | { tipo: "procesar" | "rechazar"; venta: Reintegro }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir(tipo: "procesar" | "rechazar", venta: Reintegro) {
    setAccion({ tipo, venta });
    setError(null);
  }
  function cerrar() {
    if (submitting) return;
    setAccion(null);
    setError(null);
  }

  async function callApi(url: string, payload: any) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al procesar");
        setSubmitting(false);
        return;
      }
      setAccion(null);
      router.refresh();
      setSubmitting(false);
    } catch (err: any) {
      setError(err.message || "Error de conexión");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        {reintegros.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-purple-200 p-5 hover:shadow-md transition">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Link
                    href={`/ventas/${r.id}?t=${tenant}`}
                    className="font-semibold text-slate-900 hover:text-brand-700"
                  >
                    Venta #{r.nro}
                  </Link>
                  <span className="text-xs text-slate-500">·</span>
                  <span className="text-sm text-slate-600">{r.proyecto_nombre}</span>
                  <span className="text-xs text-slate-500">·</span>
                  <span className="text-sm text-slate-600">
                    {r.lote_manzana ? `M${r.lote_manzana}-` : ""}L{r.lote_numero}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-800 mb-1">
                  {r.comprador}
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  Solicitado: {formatDateTime(r.solicitud_reintegro_at)}
                </div>
                <div className="text-xs bg-slate-50 border border-slate-200 rounded p-2 text-slate-700">
                  <span className="font-medium">Motivo:</span> {r.solicitud_reintegro_motivo}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs text-slate-500">A reintegrar</div>
                <div className="text-2xl font-bold text-purple-700">
                  {formatMoney(r.monto_total_reintegrar)}
                </div>
                <div className="text-xs text-slate-500">
                  {r.cobranzas_count} cobranza{r.cobranzas_count === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => abrir("rechazar", r)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                <XCircle size={14} />
                Rechazar
              </button>
              <button
                onClick={() => abrir("procesar", r)}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
              >
                <CheckCircle2 size={14} />
                Procesar reintegro
              </button>
            </div>
          </div>
        ))}
      </div>

      {accion?.tipo === "procesar" && (
        <ModalProcesar
          tenant={tenant}
          venta={accion.venta}
          onClose={cerrar}
          onCall={callApi}
          submitting={submitting}
          error={error}
        />
      )}
      {accion?.tipo === "rechazar" && (
        <ModalRechazarReintegro
          tenant={tenant}
          venta={accion.venta}
          onClose={cerrar}
          onCall={callApi}
          submitting={submitting}
          error={error}
        />
      )}
    </>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalProcesar({ tenant, venta, onClose, onCall, submitting, error }: any) {
  const [medio, setMedio] = useState("EFECTIVO");
  const [banco, setBanco] = useState("");
  const [numOp, setNumOp] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState("");
  const [confirmado, setConfirmado] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!confirmado) return;
    onCall(`/api/ventas/${venta.id}/procesar-reintegro`, {
      tenant,
      medio_pago: medio,
      banco_origen: banco.trim() || null,
      numero_operacion: numOp.trim() || null,
      fecha,
      observaciones: obs.trim() || null,
    });
  }

  const requiereBanco = ["TRANSFERENCIA", "CHEQUE_COMUN", "CHEQUE_DIFERIDO"].includes(medio);

  return (
    <ModalWrap title={`Procesar reintegro · Venta #${venta.nro}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs bg-purple-50 border border-purple-200 rounded p-2 space-y-1">
          <div className="font-medium text-purple-900">Al procesar:</div>
          <div>"¢ Se crea {venta.cobranzas_count} orden{venta.cobranzas_count === 1 ? "" : "es"} de pago (numeración propia)</div>
          <div>"¢ La{venta.cobranzas_count === 1 ? "" : "s"} cobranza{venta.cobranzas_count === 1 ? "" : "s"} pasa{venta.cobranzas_count === 1 ? "" : "n"} a ANULADA</div>
          <div>"¢ La venta queda ANULADA</div>
          <div>"¢ El lote vuelve a DISPONIBLE</div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded p-3">
          <div>
            <div className="text-slate-500">Cliente</div>
            <div className="font-medium">{venta.comprador}</div>
          </div>
          <div className="text-right">
            <div className="text-slate-500">Total a reintegrar</div>
            <div className="text-lg font-bold text-purple-700">{formatMoney(venta.monto_total_reintegrar)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Medio de pago</label>
            <select
              value={medio}
              onChange={(e) => setMedio(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CHEQUE_COMUN">Cheque común</option>
              <option value="CHEQUE_DIFERIDO">Cheque diferido</option>
              <option value="MERCADOPAGO">MercadoPago</option>
              <option value="COMPENSACION">Compensación</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {requiereBanco && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Banco / Cuenta</label>
              <input
                type="text"
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">N° operación / cheque</label>
              <input
                type="text"
                value={numOp}
                onChange={(e) => setNumOp(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-slate-600 mb-1 block">Observaciones</label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <label className="flex items-start gap-2 cursor-pointer p-2 bg-amber-50 border border-amber-200 rounded">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(e) => setConfirmado(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs text-amber-900">
            Confirmo que entregué <strong>{formatMoney(venta.monto_total_reintegrar)}</strong> al cliente <strong>{venta.comprador}</strong>.
            Esta operación no se puede revertir.
          </span>
        </label>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}

        <ModalActions onClose={onClose} submitting={submitting} label="Procesar reintegro" disabled={!confirmado} />
      </form>
    </ModalWrap>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalRechazarReintegro({ tenant, venta, onClose, onCall, submitting, error }: any) {
  const [motivo, setMotivo] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) return;
    onCall(`/api/ventas/${venta.id}/rechazar-reintegro`, { tenant, motivo: motivo.trim() });
  }

  return (
    <ModalWrap title={`Rechazar reintegro · Venta #${venta.nro}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2">
          La venta volverá al estado anterior (rechazada). El vendedor verá tu motivo y podrá decidir qué hacer (corregir, reintentar o volver a solicitar anulación).
        </div>

        <div>
          <label className="text-xs text-slate-600 mb-1 block">
            Motivo del rechazo <span className="text-red-500">*</span>
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={4}
            autoFocus
            placeholder="¿Por qué no podés procesar el reintegro? (ej: cliente no se presentó, datos incompletos...)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}

        <ModalActions onClose={onClose} submitting={submitting} label="Rechazar" labelColor="red" disabled={motivo.trim().length < 3} />
      </form>
    </ModalWrap>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalWrap({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, submitting, label, labelColor = "brand", disabled = false }: any) {
  const color = labelColor === "red" ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700";
  return (
    <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 mt-4">
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={submitting || disabled}
        className={`px-6 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 ${color}`}
      >
        {submitting ? "Procesando..." : label}
      </button>
    </div>
  );
}
