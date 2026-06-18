"use client";

import { useState, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import Link from "next/link";

type Cuota = {
  id: string;
  numero: number;
  fecha_vto: string;
  estado: string;
  monto_cuota: number;        // cuota_base ajustada
  dias_vencidos: number;       // 0 si no vencida
  punitorios: number;          // calculados
  capital_orig: number;
  iva_orig: number;
  interes_orig: number;
  proyecto_nombre: string;
  lote_numero: string;
  venta_id: string;
};

type Medio = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
};

type Persona = {
  id: string;
  nombre: string;
  cuit: string | null;
};

function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

export function NuevaCobranzaForm({
  tenant,
  persona,
  cuotas,
  medios,
}: {
  tenant: string;
  persona: Persona;
  cuotas: Cuota[];
  medios: Medio[];
}) {
  const router = useRouter();
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [condonarDiaPorCuota, setCondonarDiaPorCuota] = useState<Set<string>>(new Set());
  const [medioId, setMedioId] = useState(medios[0]?.id || "");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cálculo del total con condonaciones aplicadas
  const { total, totalPunitorios, totalCondonado } = useMemo(() => {
    let suma = 0;
    let puniTotal = 0;
    let condonado = 0;
    for (const c of cuotas) {
      if (!seleccionadas.has(c.id)) continue;
      suma += c.monto_cuota;
      
      // Punitorios: si están condonados (solo 1 día) no se suman
      const puedeCondonar = c.dias_vencidos === 1;
      const condonarEsta = puedeCondonar && condonarDiaPorCuota.has(c.id);
      
      if (condonarEsta) {
        condonado += c.punitorios;
      } else {
        suma += c.punitorios;
        puniTotal += c.punitorios;
      }
    }
    return { total: suma, totalPunitorios: puniTotal, totalCondonado: condonado };
  }, [cuotas, seleccionadas, condonarDiaPorCuota]);

  function toggleCuota(id: string) {
    const next = new Set(seleccionadas);
    if (next.has(id)) {
      next.delete(id);
      // Si se quita, también quitar la condonación
      const nextCond = new Set(condonarDiaPorCuota);
      nextCond.delete(id);
      setCondonarDiaPorCuota(nextCond);
    } else {
      next.add(id);
    }
    setSeleccionadas(next);
  }

  function tildarTodasVencidas() {
    const next = new Set(seleccionadas);
    for (const c of cuotas) {
      if (c.dias_vencidos > 0) next.add(c.id);
    }
    setSeleccionadas(next);
  }

  function tildarPrimera() {
    if (cuotas.length === 0) return;
    const next = new Set(seleccionadas);
    next.add(cuotas[0].id);
    setSeleccionadas(next);
  }

  function limpiar() {
    setSeleccionadas(new Set());
    setCondonarDiaPorCuota(new Set());
  }

  function toggleCondonarDia(id: string) {
    const next = new Set(condonarDiaPorCuota);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCondonarDiaPorCuota(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (seleccionadas.size === 0) {
      setError("Tenés que seleccionar al menos una cuota");
      return;
    }
    if (!medioId) {
      setError("Tenés que elegir un medio de pago");
      return;
    }

    setSubmitting(true);

    const imputaciones = cuotas
      .filter((c) => seleccionadas.has(c.id))
      .map((c) => ({
        cuota_id: c.id,
        condonar_dia: c.dias_vencidos === 1 && condonarDiaPorCuota.has(c.id),
      }));

    try {
      const res = await fetch("/api/cobranzas/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          persona_id: persona.id,
          medio_cobro_id: medioId,
          referencia: referencia || null,
          observaciones: observaciones || null,
          imputaciones,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al registrar la cobranza");
        setSubmitting(false);
        return;
      }

      // Redirigir al detalle de la cobranza creada
      router.push(`/cobranzas/${data.cobranza_id}?t=${tenant}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error de conexión");
      setSubmitting(false);
    }
  }

  if (cuotas.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          Este cliente está al día
        </h2>
        <p className="text-slate-500 text-sm">
          No tiene cuotas pendientes en este fideicomiso.
        </p>
        <Link
          href={`/personas/${persona.id}?t=${tenant}`}
          className="inline-block mt-4 text-sm text-brand-600 hover:text-brand-700"
        >
          Ver perfil del cliente
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente confirmado */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="text-xs text-slate-500 mb-1">Cobrando a</div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">{persona.nombre}</div>
            {persona.cuit && (
              <div className="text-xs text-slate-500">{persona.cuit}</div>
            )}
          </div>
          <Link
            href={`/cobranzas/nueva?t=${tenant}`}
            className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <X size={14} />
            Cambiar
          </Link>
        </div>
      </div>

      {/* Tabla de cuotas */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">
              Cuotas pendientes ({cuotas.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {seleccionadas.size} seleccionada{seleccionadas.size === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={tildarPrimera}
              className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Próxima cuota
            </button>
            <button
              type="button"
              onClick={tildarTodasVencidas}
              className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50"
            >
              Todas vencidas
            </button>
            {seleccionadas.size > 0 && (
              <button
                type="button"
                onClick={limpiar}
                className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
          {cuotas.map((c) => {
            const seleccionada = seleccionadas.has(c.id);
            const puedeCondonar = c.dias_vencidos === 1;
            const condonarEsta = puedeCondonar && condonarDiaPorCuota.has(c.id);
            const punitorioEfectivo = condonarEsta ? 0 : c.punitorios;
            const totalCuota = c.monto_cuota + punitorioEfectivo;

            return (
              <label
                key={c.id}
                className={`block px-4 py-3 cursor-pointer transition ${
                  seleccionada ? "bg-brand-50/50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={seleccionada}
                    onChange={() => toggleCuota(c.id)}
                    className="mt-1 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="font-medium text-slate-900">
                          Cuota {c.numero}
                        </span>
                        <span className="text-xs text-slate-500 ml-2">
                          {c.proyecto_nombre} · Lote {c.lote_numero}
                        </span>
                      </div>
                      <span className="font-semibold text-slate-900">
                        {formatMoney(totalCuota)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      <span>Vto: {formatDate(c.fecha_vto)}</span>
                      {c.dias_vencidos > 0 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                          <AlertCircle size={10} />
                          {c.dias_vencidos} {c.dias_vencidos === 1 ? "día" : "días"} vencida
                        </span>
                      ) : (
                        <span className="text-slate-400">al día</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs">
                      <span className="text-slate-500">Cuota:</span>{" "}
                      <span className="text-slate-700">{formatMoney(c.monto_cuota)}</span>
                      {c.punitorios > 0 && (
                        <>
                          <span className="text-slate-400 mx-1">+</span>
                          <span className="text-slate-500">Punitorios:</span>{" "}
                          <span className={condonarEsta ? "text-slate-400 line-through" : "text-red-700 font-medium"}>
                            {formatMoney(c.punitorios)}
                          </span>
                        </>
                      )}
                    </div>
                    {/* Checkbox de condonación (solo si seleccionada y 1 día vencida) */}
                    {seleccionada && puedeCondonar && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={condonarEsta}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleCondonarDia(c.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                          />
                          <span className="text-amber-700 font-medium">
                            Condonar 1 día (gracia por inhábil) — {formatMoney(c.punitorios)}
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Medio de pago */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900 mb-3">Medio de pago</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Medio</label>
            <select
              value={medioId}
              onChange={(e) => setMedioId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            >
              {medios.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Referencia (opcional)
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nro. transferencia, cupón, etc."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-slate-500 mb-1 block">
            Observaciones (opcional)
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            placeholder="Notas internas para esta cobranza..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Total y botones */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-brand-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-slate-600">Cuotas seleccionadas</div>
            <div className="text-xl font-bold text-slate-900">
              {seleccionadas.size}
            </div>
          </div>
          {totalPunitorios > 0 && (
            <div>
              <div className="text-xs text-slate-600">Punitorios</div>
              <div className="text-xl font-bold text-red-700">
                {formatMoney(totalPunitorios)}
              </div>
            </div>
          )}
          {totalCondonado > 0 && (
            <div>
              <div className="text-xs text-slate-600">Condonado</div>
              <div className="text-xl font-bold text-amber-600 line-through">
                {formatMoney(totalCondonado)}
              </div>
            </div>
          )}
          <div className={totalPunitorios > 0 || totalCondonado > 0 ? "" : "md:col-span-2"}>
            <div className="text-xs text-slate-600">Total a cobrar</div>
            <div className="text-3xl font-bold text-brand-700">
              {formatMoney(total)}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Link
            href={`/cobranzas?t=${tenant}`}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-white"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || seleccionadas.size === 0 || total <= 0}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Registrando..." : `Confirmar Cobro · ${formatMoney(total)}`}
          </button>
        </div>
      </div>
    </form>
  );
}
