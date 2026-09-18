"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit, CheckCircle2, XCircle, DollarSign, FileText, AlertTriangle, X, Calendar
} from "lucide-react";
import { MoneyInput } from "@/components/MoneyInput";
import { ROLES, roleAllowed, type Role } from "@/lib/roles";

type Venta = {
  id: string;
  estado: string;
  nro: number | null;
  anticipo: number;
  anticipo_cobrado: number;
  anticipo_restante: number;
  precio_total: number;
  precio_lista: number;
  descuento_financiero: number;
  descuento_comercial: number;
  cant_cuotas: number;
  cuota_base: number;
  sistema_amort: string;
  fecha_primer_vto: string;
  requiere_aut_desc_fin: boolean;
  total_descuentos_off_books: number; // suma de descuentos_comerciales
};

function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function DetalleVentaActions({
  tenant,
  venta,
}: {
  tenant: string;
  venta: Venta;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "cobrar" | "rechazar-comercial" | "rechazar-contab" | "reclasificar" | "contabilizar" | "corregir-rechazo" | "solicitar-anulacion" | "volver-a-carga">(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rol, setRol] = useState<Role | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.usuario?.rol) setRol(data.usuario.rol as Role);
      })
      .catch(() => {});
  }, []);

  const puedeGerencia = rol ? roleAllowed(rol, ROLES.GERENCIA) : false;
  const puedeContabilidad = rol ? roleAllowed(rol, ROLES.CONTABILIDAD) : false;
  const puedeCaja = rol ? roleAllowed(rol, ROLES.CAJA) : false;

  function closeModal() {
    if (submitting) return;
    setModal(null);
    setError(null);
  }

  async function callApi(url: string, payload: any, successMessage?: string) {
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
      setModal(null);
      router.refresh();
      setSubmitting(false);
    } catch (err: any) {
      setError(err.message || "Error de conexión");
      setSubmitting(false);
    }
  }

  async function handleAutorizar() {
    if (!confirm("¿Confirmás la autorización de esta venta?")) return;
    await callApi(`/api/ventas/${venta.id}/autorizar`, { tenant });
  }

  return (
    <>
      {/* Botones contextuales según estado */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-brand-200 rounded-xl p-5">
        {venta.estado === "EN_CARGA" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-sm text-slate-700 font-medium">Acciones disponibles:</span>
              <Link
                href={`/ventas/${venta.id}/editar?t=${tenant}`}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                <Edit size={16} />
                Editar / Continuar carga
              </Link>
              <button
                onClick={() => setModal("solicitar-anulacion")}
                className="inline-flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg"
              >
                <XCircle size={16} />
                {venta.anticipo_cobrado > 0 ? "Solicitar anulación con reintegro" : "Anular venta"}
              </button>
            </div>
            {venta.anticipo_cobrado > 0 && (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
                Anticipo cobrado vigente: <strong>{formatMoney(venta.anticipo_cobrado)}</strong>.
                Si seguís editando y cerrás, la venta vuelve al flujo normal. Si la anulás, pasa a Caja para el reintegro.
              </div>
            )}
          </div>
        )}

        {venta.estado === "CERRADA_PENDIENTE" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-sm text-slate-700 font-medium">Esperando cobro de anticipo</span>
              {venta.anticipo > 0 && venta.anticipo_restante > 0 && puedeCaja && (
                <button
                  onClick={() => setModal("cobrar")}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  <DollarSign size={16} />
                  Cobrar anticipo
                </button>
              )}
              {venta.anticipo > 0 && venta.anticipo_restante > 0 && rol && !puedeCaja && (
                <span className="text-xs text-slate-500">Solo caja puede cobrar el anticipo.</span>
              )}
              <button
                onClick={() => setModal("volver-a-carga")}
                className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-4 py-2 rounded-lg"
                title="Volver la venta a EN_CARGA para editarla. Las cobranzas se mantienen."
              >
                <Edit size={16} />
                Editar venta
              </button>
              <button
                onClick={() => setModal("solicitar-anulacion")}
                className="inline-flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg"
              >
                <XCircle size={16} />
                {venta.anticipo_cobrado > 0 ? "Solicitar anulación con reintegro" : "Anular venta"}
              </button>
            </div>
            {venta.anticipo > 0 && (
              <div className="text-xs text-slate-600">
                Cobrado: {formatMoney(venta.anticipo_cobrado)} de {formatMoney(venta.anticipo)} · 
                Falta: <span className="font-medium">{formatMoney(venta.anticipo_restante)}</span>
              </div>
            )}
          </div>
        )}

        {venta.estado === "CERRADA_CONFIRMADA" && (
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm text-slate-700 font-medium">
              Pendiente autorización del Gerente Comercial
              {venta.requiere_aut_desc_fin && " (incluye descuento por encima del tope)"}
            </span>
            {puedeGerencia ? (
              <>
                <button
                  onClick={handleAutorizar}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  Autorizar
                </button>
                <button
                  onClick={() => setModal("rechazar-comercial")}
                  className="inline-flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg"
                >
                  <XCircle size={16} />
                  Rechazar
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-500">
                Solo Laura (gerencia) puede autorizar. Tu rol: {rol || "…"}.
              </span>
            )}
          </div>
        )}

        {venta.estado === "AUTORIZADA" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-sm text-slate-700 font-medium">Pendiente contabilización</span>
              {puedeContabilidad ? (
                <button
                  onClick={() => setModal("contabilizar")}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  <FileText size={16} />
                  Contabilizar
                </button>
              ) : (
                <span className="text-xs text-slate-500">Solo contabilidad puede contabilizar.</span>
              )}
              {venta.anticipo_cobrado > 0 && venta.total_descuentos_off_books === 0 && (
                <button
                  onClick={() => setModal("reclasificar")}
                  className="inline-flex items-center gap-2 border border-purple-300 text-purple-700 hover:bg-purple-50 text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Reclasificar anticipo
                </button>
              )}
              {venta.total_descuentos_off_books > 0 && (
                <button
                  onClick={() => callApi(`/api/ventas/${venta.id}/revertir-reclasificacion`, { tenant }, "")}
                  className="inline-flex items-center gap-2 border border-purple-300 text-purple-700 hover:bg-purple-50 text-sm font-medium px-4 py-2 rounded-lg"
                  title="Restaurar el anticipo: descuentos comerciales vuelven a ser anticipo"
                >
                  Revertir reclasificación ({formatMoney(venta.total_descuentos_off_books)})
                </button>
              )}
              <button
                onClick={() => setModal("rechazar-contab")}
                className="inline-flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg"
              >
                <XCircle size={16} />
                Rechazar
              </button>
            </div>
            {venta.total_descuentos_off_books > 0 && (
              <div className="text-xs text-purple-700">
                Esta venta tiene {formatMoney(venta.total_descuentos_off_books)} reclasificados como descuento comercial.
                Podés revertir para volver al estado original o seguir hacia contabilizar.
              </div>
            )}
          </div>
        )}

        {venta.estado === "CONTABILIZADA" && (
          <div className="text-sm text-green-700 font-medium inline-flex items-center gap-2">
            <CheckCircle2 size={16} />
            Venta contabilizada. Plan de cuotas generado.
          </div>
        )}

        {(venta.estado === "RECHAZADA_COMERCIAL" || venta.estado === "RECHAZADA_CONTABILIDAD") && (
          <div className="space-y-3">
            <div className="text-sm text-red-700 font-medium inline-flex items-center gap-2">
              <XCircle size={16} />
              {venta.estado === "RECHAZADA_COMERCIAL" 
                ? "Rechazada por Gerente Comercial" 
                : "Rechazada por Admin Contabilidad"}
              {" — Ver historial para el motivo. ¿Qué hacer?"}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setModal("corregir-rechazo")}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                <Edit size={16} />
                Corregir y reanudar
              </button>
              {venta.anticipo_cobrado > 0 && (
                <button
                  onClick={() => setModal("solicitar-anulacion")}
                  className="inline-flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg"
                >
                  <XCircle size={16} />
                  Solicitar anulación con reintegro
                </button>
              )}
              {venta.anticipo_cobrado === 0 && (
                <button
                  onClick={() => setModal("solicitar-anulacion")}
                  className="inline-flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg"
                >
                  <XCircle size={16} />
                  Anular venta
                </button>
              )}
            </div>
            {venta.anticipo_cobrado > 0 && (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
                Anticipo cobrado vigente: <strong>{formatMoney(venta.anticipo_cobrado)}</strong>.
                Si reanudás la venta, este monto se reutiliza. Si la anulás, pasa a Caja para el reintegro.
              </div>
            )}
          </div>
        )}

        {venta.estado === "PENDIENTE_REINTEGRO" && (
          <div className="text-sm text-orange-700 font-medium inline-flex items-center gap-2">
            <AlertTriangle size={16} />
            Pendiente reintegro por Caja. El vendedor ya solicitó la anulación.
          </div>
        )}

        {venta.estado === "ANULADA" && (
          <div className="text-sm text-slate-500 inline-flex items-center gap-2">
            Venta anulada.
          </div>
        )}
      </div>

      {/* Modal cobrar anticipo */}
      {modal === "cobrar" && (
        <ModalCobrarAnticipo
          tenant={tenant}
          venta={venta}
          onClose={closeModal}
          onCall={callApi}
          submitting={submitting}
          error={error}
        />
      )}

      {/* Modal rechazar (comercial) */}
      {(modal === "rechazar-comercial" || modal === "rechazar-contab") && (
        <ModalRechazar
          tenant={tenant}
          venta={venta}
          rol={modal === "rechazar-comercial" ? "COMERCIAL" : "CONTABILIDAD"}
          onClose={closeModal}
          onCall={callApi}
          submitting={submitting}
          error={error}
        />
      )}

      {/* Modal reclasificar */}
      {modal === "reclasificar" && (
        <ModalReclasificar
          tenant={tenant}
          venta={venta}
          onClose={closeModal}
          onCall={callApi}
          submitting={submitting}
          error={error}
        />
      )}

      {/* Modal contabilizar */}
      {modal === "contabilizar" && (
        <ModalContabilizar
          tenant={tenant}
          venta={venta}
          onClose={closeModal}
          onCall={callApi}
          submitting={submitting}
          error={error}
        />
      )}

      {/* Modal corregir rechazo */}
      {modal === "corregir-rechazo" && (
        <ModalCorregirRechazo
          tenant={tenant}
          venta={venta}
          onClose={closeModal}
          onCall={callApi}
          submitting={submitting}
          error={error}
        />
      )}

      {/* Modal solicitar anulación */}
      {modal === "solicitar-anulacion" && (
        <ModalSolicitarAnulacion
          tenant={tenant}
          venta={venta}
          onClose={closeModal}
          onCall={callApi}
          submitting={submitting}
          error={error}
        />
      )}

      {/* Modal volver a EN_CARGA para editar */}
      {modal === "volver-a-carga" && (
        <ModalVolverACarga
          tenant={tenant}
          venta={venta}
          onClose={closeModal}
          onCall={callApi}
          submitting={submitting}
          error={error}
        />
      )}
    </>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: COBRAR ANTICIPO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalCobrarAnticipo({ tenant, venta, onClose, onCall, submitting, error }: any) {
  const [monto, setMonto] = useState<number | "">(venta.anticipo_restante);
  const [medioPago, setMedioPago] = useState("EFECTIVO");
  const [banco, setBanco] = useState("");
  const [numOp, setNumOp] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!monto || typeof monto !== "number" || monto <= 0) return;
    onCall(`/api/ventas/${venta.id}/cobrar-anticipo`, {
      tenant,
      monto,
      medio_pago: medioPago,
      banco_origen: banco.trim() || null,
      numero_operacion: numOp.trim() || null,
      fecha,
      observaciones: obs.trim() || null,
    });
  }

  const requiereBanco = ["TRANSFERENCIA", "CHEQUE_COMUN", "CHEQUE_DIFERIDO"].includes(medioPago);

  return (
    <ModalBase title="Cobrar anticipo" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2">
          Anticipo total: <span className="font-medium">{formatMoney(venta.anticipo)}</span>
          {" · "}Ya cobrado: <span className="font-medium">{formatMoney(venta.anticipo_cobrado)}</span>
          {" · "}Falta: <span className="font-medium text-green-700">{formatMoney(venta.anticipo_restante)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Monto a cobrar</label>
            <MoneyInput
              value={monto}
              onChange={setMonto}
              autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
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

        <div>
          <label className="text-xs text-slate-600 mb-1 block">Medio de pago</label>
          <select
            value={medioPago}
            onChange={(e) => setMedioPago(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="CHEQUE_COMUN">Cheque común</option>
            <option value="CHEQUE_DIFERIDO">Cheque diferido</option>
            <option value="TARJETA_DEBITO">Tarjeta débito</option>
            <option value="TARJETA_CREDITO">Tarjeta crédito</option>
            <option value="MERCADOPAGO">MercadoPago</option>
            <option value="DECIDIR">Decidir</option>
            <option value="CRIPTO">Criptomoneda</option>
            <option value="COMPENSACION">Compensación</option>
          </select>
        </div>

        {requiereBanco && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Banco origen</label>
              <input
                type="text"
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Número operación</label>
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

        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 inline-flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <div>
            Esta cobranza queda como recibo <strong>provisorio</strong> (BORRADOR). 
            Se confirma al contabilizar la venta.
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}

        <ModalActions onClose={onClose} submitting={submitting} label="Cobrar" />
      </form>
    </ModalBase>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: RECHAZAR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalRechazar({ tenant, venta, rol, onClose, onCall, submitting, error }: any) {
  const [motivo, setMotivo] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) return;
    onCall(`/api/ventas/${venta.id}/rechazar`, {
      tenant,
      motivo: motivo.trim(),
      rol,
    });
  }

  return (
    <ModalBase title={`Rechazar venta (${rol === "COMERCIAL" ? "Gerente Comercial" : "Contabilidad"})`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2">
          La venta quedará marcada como <strong>{rol === "COMERCIAL" ? "RECHAZADA_COMERCIAL" : "RECHAZADA_CONTABILIDAD"}</strong>.
          {venta.anticipo_cobrado > 0 && (
            <div className="mt-1">
              Las cobranzas del anticipo ({formatMoney(venta.anticipo_cobrado)}) <strong>se mantienen vivas</strong>.
              El vendedor decidirá si corrige y reanuda (reutilizando el anticipo) o si solicita anulación con reintegro.
            </div>
          )}
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
            placeholder="Describí qué falla y qué hay que corregir..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="text-xs text-slate-500 mt-1">Mínimo 3 caracteres</div>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}

        <ModalActions onClose={onClose} submitting={submitting} label="Rechazar" labelColor="red" disabled={motivo.trim().length < 3} />
      </form>
    </ModalBase>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: RECLASIFICAR ANTICIPO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalReclasificar({ tenant, venta, onClose, onCall, submitting, error }: any) {
  const [montoReclas, setMontoReclas] = useState<number | "">(venta.anticipo_cobrado);
  const [obs, setObs] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!montoReclas || typeof montoReclas !== "number" || montoReclas <= 0) return;
    if (!confirm(`¿Reclasificar ${formatMoney(montoReclas)} como descuento comercial?`)) return;
    onCall(`/api/ventas/${venta.id}/reclasificar-anticipo`, {
      tenant,
      monto_reclasificar: montoReclas,
      observaciones: obs.trim() || null,
    });
  }

  // Preview de cómo queda la venta
  const m = typeof montoReclas === "number" ? montoReclas : 0;
  const nuevoAnticipo = venta.anticipo - m;
  const nuevoDescCom = venta.descuento_comercial + m;
  const nuevoPrecioTotal = venta.precio_lista - venta.descuento_financiero - nuevoDescCom;

  return (
    <ModalBase title="Reclasificar anticipo a descuento comercial" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs bg-purple-50 border border-purple-200 rounded p-2">
          El monto reclasificado queda como <strong>descuento comercial (off-books)</strong>. 
          Las cobranzas del anticipo se marcan como RECLASIFICADAS, sin recibo oficial.
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded p-3">
          <div>
            <div className="text-slate-500">Anticipo cobrado actual</div>
            <div className="font-medium">{formatMoney(venta.anticipo_cobrado)}</div>
          </div>
          <div>
            <div className="text-slate-500">Descuento comercial actual</div>
            <div className="font-medium">{formatMoney(venta.descuento_comercial)}</div>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-600 mb-1 block">Monto a reclasificar</label>
          <MoneyInput
            value={montoReclas}
            onChange={setMontoReclas}
            autoFocus
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="text-xs text-slate-500 mt-1">
            Máximo: {formatMoney(venta.anticipo_cobrado)} (anticipo cobrado disponible)
          </div>
        </div>

        {/* Preview */}
        {m > 0 && m <= venta.anticipo_cobrado && (
          <div className="border border-brand-200 bg-brand-50/50 rounded-lg p-3 text-xs space-y-1">
            <div className="font-semibold text-slate-700 mb-2">Vista previa después de reclasificar:</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-slate-500">Anticipo</div>
                <div className="font-medium">{formatMoney(nuevoAnticipo)}</div>
              </div>
              <div>
                <div className="text-slate-500">Desc. comercial</div>
                <div className="font-medium">{formatMoney(nuevoDescCom)}</div>
              </div>
              <div>
                <div className="text-slate-500">Precio boleto (oficial)</div>
                <div className="font-medium text-slate-900">{formatMoney(nuevoPrecioTotal)}</div>
              </div>
              <div>
                <div className="text-slate-500">A financiar</div>
                <div className="font-medium">{formatMoney(nuevoPrecioTotal - nuevoAnticipo)}</div>
              </div>
            </div>
            <div className="text-slate-500 pt-2 border-t border-brand-200 mt-2">
              Cuotas: <strong>{formatMoney(venta.cuota_base)}</strong> × {venta.cant_cuotas} (no cambian)
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-slate-600 mb-1 block">Observaciones</label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            placeholder="Motivo de la reclasificación..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}

        <ModalActions 
          onClose={onClose} 
          submitting={submitting} 
          label="Reclasificar" 
          disabled={!m || m > venta.anticipo_cobrado}
        />
      </form>
    </ModalBase>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: CONTABILIZAR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalContabilizar({ tenant, venta, onClose, onCall, submitting, error }: any) {
  const [fechaPrimerVto, setFechaPrimerVto] = useState(venta.fecha_primer_vto);
  const [obs, setObs] = useState("");

  const hoyStr = new Date().toISOString().slice(0, 10);
  const fechaYaPaso = fechaPrimerVto < hoyStr;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!confirm(`¿Contabilizar la venta? Se generarán ${venta.cant_cuotas} cuotas y el lote quedará VENDIDO.`)) return;
    onCall(`/api/ventas/${venta.id}/contabilizar`, {
      tenant,
      fecha_primer_vto: fechaPrimerVto,
      observaciones: obs.trim() || null,
    });
  }

  return (
    <ModalBase title="Contabilizar venta" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs bg-green-50 border border-green-200 rounded p-2 space-y-1">
          <div className="font-medium text-green-900">Al contabilizar:</div>
          <div>"¢ Se generan {venta.cant_cuotas} cuotas ({venta.sistema_amort})</div>
          <div>"¢ Las cobranzas BORRADOR pasan a CONFIRMADA (emiten recibo oficial)</div>
          <div>"¢ El lote queda VENDIDO</div>
          <div>"¢ La venta queda CONTABILIZADA (no se puede deshacer)</div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded p-3">
          <div>
            <div className="text-slate-500">Sistema</div>
            <div className="font-medium">{venta.sistema_amort}</div>
          </div>
          <div>
            <div className="text-slate-500">Cant. cuotas</div>
            <div className="font-medium">{venta.cant_cuotas}</div>
          </div>
          <div>
            <div className="text-slate-500">Cuota base</div>
            <div className="font-medium">{formatMoney(venta.cuota_base)}</div>
          </div>
          <div>
            <div className="text-slate-500">Precio boleto</div>
            <div className="font-medium">{formatMoney(venta.precio_total)}</div>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-600 mb-1 block">
            Fecha primer vencimiento
          </label>
          <input
            type="date"
            value={fechaPrimerVto}
            onChange={(e) => setFechaPrimerVto(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {fechaYaPaso && (
            <div className="text-xs text-amber-700 mt-1 inline-flex items-center gap-1">
              <AlertTriangle size={12} />
              La fecha ya pasó. La primera cuota nacerá vencida.
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-slate-600 mb-1 block">Observaciones</label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}

        <ModalActions onClose={onClose} submitting={submitting} label="Contabilizar" />
      </form>
    </ModalBase>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: CORREGIR Y REANUDAR (post-rechazo)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalCorregirRechazo({ tenant, venta, onClose, onCall, submitting, error }: any) {
  const [cambiarLote, setCambiarLote] = useState(false);
  const [callApiCustom, setCallApiCustom] = useState(false);
  const router = useRouter();
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLocalSubmitting(true);
    setLocalError(null);
    try {
      const res = await fetch(`/api/ventas/${venta.id}/corregir-rechazo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, permite_cambiar_lote: cambiarLote }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error || "Error");
        setLocalSubmitting(false);
        return;
      }
      // Si tildó cambiar lote → ir a editar con el flag
      // Si no → ir a editar normal
      const url = cambiarLote
        ? `/ventas/${venta.id}/editar?t=${tenant}&cambiarLote=1`
        : `/ventas/${venta.id}/editar?t=${tenant}`;
      router.push(url);
      router.refresh();
    } catch (err: any) {
      setLocalError(err.message || "Error de conexión");
      setLocalSubmitting(false);
    }
  }

  return (
    <ModalBase title="Corregir y reanudar venta" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2 space-y-1">
          <div className="font-medium text-blue-900">Al reanudar:</div>
          <div>"¢ La venta vuelve a <strong>EN_CARGA</strong></div>
          <div>"¢ Se conservan las cobranzas del anticipo ({formatMoney(venta.anticipo_cobrado)})</div>
          <div>"¢ El lote sigue RESERVADO</div>
          <div>"¢ Vas a poder editar la venta antes de cerrarla de nuevo</div>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={cambiarLote}
            onChange={(e) => setCambiarLote(e.target.checked)}
          />
          <span className="text-sm text-slate-700">Quiero cambiar el lote</span>
        </label>
        {cambiarLote && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            En la próxima pantalla podrás elegir otro lote. El anticipo cobrado se mantiene asociado a la venta.
          </div>
        )}

        {localError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{localError}</div>
        )}

        <ModalActions onClose={onClose} submitting={localSubmitting} label="Reanudar venta" />
      </form>
    </ModalBase>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: SOLICITAR ANULACIÓN CON REINTEGRO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalSolicitarAnulacion({ tenant, venta, onClose, onCall, submitting, error }: any) {
  const [motivo, setMotivo] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) return;
    onCall(`/api/ventas/${venta.id}/solicitar-anulacion`, {
      tenant,
      motivo: motivo.trim(),
    });
  }

  const hayAnticipo = venta.anticipo_cobrado > 0;

  return (
    <ModalBase title={hayAnticipo ? "Solicitar anulación con reintegro" : "Anular venta"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {hayAnticipo ? (
          <div className="text-xs bg-red-50 border border-red-200 rounded p-2 space-y-1">
            <div className="font-medium text-red-900">Al solicitar:</div>
            <div>"¢ La venta pasa a <strong>PENDIENTE_REINTEGRO</strong></div>
            <div>"¢ Aparecerá en el panel de Caja para procesar el reintegro</div>
            <div>"¢ Monto a reintegrar: <strong>{formatMoney(venta.anticipo_cobrado)}</strong></div>
            <div>"¢ El cajero efectuará el egreso al cliente</div>
            <div>"¢ Cuando se procese el reintegro, la venta quedará ANULADA y el lote DISPONIBLE</div>
          </div>
        ) : (
          <div className="text-xs bg-red-50 border border-red-200 rounded p-2 space-y-1">
            <div className="font-medium text-red-900">Al anular:</div>
            <div>"¢ La venta pasa a <strong>ANULADA</strong> directamente (no hay anticipo cobrado)</div>
            <div>"¢ El lote vuelve a DISPONIBLE</div>
          </div>
        )}

        <div>
          <label className="text-xs text-slate-600 mb-1 block">
            Motivo <span className="text-red-500">*</span>
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            autoFocus
            placeholder="¿Por qué se anula esta venta? El cliente lo verá en su comprobante de reintegro."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="text-xs text-slate-500 mt-1">Mínimo 3 caracteres</div>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}

        <ModalActions 
          onClose={onClose} 
          submitting={submitting} 
          label={hayAnticipo ? "Solicitar anulación" : "Anular venta"} 
          labelColor="red"
          disabled={motivo.trim().length < 3}
        />
      </form>
    </ModalBase>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: VOLVER A EN_CARGA (vendedor reabre para editar desde CERRADA_PENDIENTE)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalVolverACarga({ tenant, venta, onClose, onCall, submitting, error }: any) {
  const [motivo, setMotivo] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    onCall(`/api/ventas/${venta.id}/volver-a-carga`, {
      tenant,
      motivo: motivo.trim() || null,
    });
  }

  return (
    <ModalBase title="Editar venta (volver a EN_CARGA)" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2 space-y-1">
          <div className="font-medium text-blue-900">Al reabrir:</div>
          <div>"¢ La venta vuelve a <strong>EN_CARGA</strong></div>
          <div>"¢ Las cobranzas del anticipo {venta.anticipo_cobrado > 0 ? `(${formatMoney(venta.anticipo_cobrado)}) ` : ""}se conservan</div>
          <div>"¢ El lote sigue RESERVADO</div>
          <div>"¢ Cuando vuelvas a cerrar, el anticipo cobrado se reutiliza</div>
        </div>

        <div>
          <label className="text-xs text-slate-600 mb-1 block">Motivo (opcional)</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Ej: corregir cantidad de cuotas, ajustar precio..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}

        <ModalActions onClose={onClose} submitting={submitting} label="Reabrir para editar" />
      </form>
    </ModalBase>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// COMPONENTES AUXILIARES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ModalBase({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

function ModalActions({
  onClose,
  submitting,
  label,
  labelColor = "brand",
  disabled = false,
}: {
  onClose: () => void;
  submitting: boolean;
  label: string;
  labelColor?: "brand" | "red";
  disabled?: boolean;
}) {
  const colorClasses = labelColor === "red"
    ? "bg-red-600 hover:bg-red-700"
    : "bg-brand-600 hover:bg-brand-700";

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
        className={`px-6 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 ${colorClasses}`}
      >
        {submitting ? "Procesando..." : label}
      </button>
    </div>
  );
}
