"use client";

import { useState, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, X, ChevronDown, ChevronRight } from "lucide-react";
import { MultiMedioInput, MedioRow, Medio } from "@/components/MultiMedioInput";

type SaldoCuotaUI = {
  cuota_id: string;
  numero: number;
  fecha_vto: string;
  estado: string;
  dias_vencidos: number;
  ultima_fecha_pago: string | null;
  proyecto_nombre: string;
  lote_id: string;
  lote_numero: string;
  lote_manzana: string | null;
  capital_pendiente: number;
  iva_capital_pendiente: number;
  interes_pendiente: number;
  iva_interes_pendiente: number;
  ajuste_pendiente: number;
  iva_ajuste_pendiente: number;
  punitorios_pendientes: number;
  iva_punitorios_pendientes: number;
  saldo_total_sin_punitorios: number;
  saldo_total_con_punitorios: number;
  prop_gravada: number;
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

type SeleccionCuota = {
  cuota_id: string;
  modo: "TOTAL" | "PARCIAL";
  monto_imputar: number;
  bonif_punitorios: number;
  bonif_motivo: string;
};

export function CobranzaVigentesForm({
  tenant,
  persona,
  cuotas,
  medios,
}: {
  tenant: string;
  persona: Persona;
  cuotas: SaldoCuotaUI[];
  medios: Medio[];
}) {
  const router = useRouter();
  const [selecciones, setSelecciones] = useState<Record<string, SeleccionCuota>>({});
  const [medioRows, setMedioRows] = useState<MedioRow[]>([]);
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  const [filtroLoteId, setFiltroLoteId] = useState<string | null>(null);

  // Derivar lista única de lotes
  const lotes = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const c of cuotas) {
      if (!map.has(c.lote_id)) {
        const mz = c.lote_manzana ? `M${c.lote_manzana}` : "";
        const lt = `L${c.lote_numero}`;
        const proy = c.proyecto_nombre;
        const label = mz ? `${mz}-${lt} · ${proy}` : `${lt} · ${proy}`;
        map.set(c.lote_id, { id: c.lote_id, label });
      }
    }
    return Array.from(map.values());
  }, [cuotas]);

  // Cuotas filtradas por lote (si hay filtro activo)
  const cuotasMostradas = useMemo(() => {
    if (!filtroLoteId) return cuotas;
    return cuotas.filter(c => c.lote_id === filtroLoteId);
  }, [cuotas, filtroLoteId]);

  function cambiarFiltro(loteId: string | null) {
    // Destildar selecciones que no estén en el lote nuevo (cuando hay filtro)
    if (loteId) {
      const cuotasDelLote = new Set(cuotas.filter(c => c.lote_id === loteId).map(c => c.cuota_id));
      const seleccionesFiltradas: Record<string, SeleccionCuota> = {};
      for (const [k, v] of Object.entries(selecciones)) {
        if (cuotasDelLote.has(k)) seleccionesFiltradas[k] = v;
      }
      setSelecciones(seleccionesFiltradas);
    }
    setFiltroLoteId(loteId);
  }

  const totalGeneral = useMemo(() => {
    return Object.values(selecciones).reduce((s, sel) => s + sel.monto_imputar, 0);
  }, [selecciones]);

  const totalBonificado = useMemo(() => {
    return Object.values(selecciones).reduce((s, sel) => s + sel.bonif_punitorios, 0);
  }, [selecciones]);

  function toggleCuota(cuota: SaldoCuotaUI) {
    if (selecciones[cuota.cuota_id]) {
      const next = { ...selecciones };
      delete next[cuota.cuota_id];
      setSelecciones(next);
    } else {
      setSelecciones({
        ...selecciones,
        [cuota.cuota_id]: {
          cuota_id: cuota.cuota_id,
          modo: "TOTAL",
          monto_imputar: cuota.saldo_total_con_punitorios,
          bonif_punitorios: 0,
          bonif_motivo: "",
        },
      });
    }
  }

  function updateSeleccion(cuota_id: string, partial: Partial<SeleccionCuota>) {
    setSelecciones({
      ...selecciones,
      [cuota_id]: { ...selecciones[cuota_id], ...partial },
    });
  }

  function tildarTodas() {
    const next: Record<string, SeleccionCuota> = { ...selecciones };
    for (const c of cuotasMostradas) {
      next[c.cuota_id] = {
        cuota_id: c.cuota_id,
        modo: "TOTAL",
        monto_imputar: c.saldo_total_con_punitorios,
        bonif_punitorios: 0,
        bonif_motivo: "",
      };
    }
    setSelecciones(next);
  }

  function limpiar() {
    setSelecciones({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const seleccionesArr = Object.values(selecciones);
    if (seleccionesArr.length === 0) {
      setError("Tenés que seleccionar al menos una cuota");
      return;
    }

    // Validar que solo haya parcial si es exactamente 1 cuota
    const parciales = seleccionesArr.filter((s) => s.modo === "PARCIAL");
    if (parciales.length > 0 && seleccionesArr.length > 1) {
      setError("Solo se permite pago parcial cuando hay una sola cuota seleccionada");
      return;
    }

    // Validar bonificación con motivo
    for (const sel of seleccionesArr) {
      if (sel.bonif_punitorios > 0 && sel.bonif_motivo.trim().length < 3) {
        setError("Si bonificás punitorios, tenés que escribir un motivo");
        return;
      }
    }

    // Validar suma de medios
    const sumaMedios = medioRows.reduce(
      (s, r) => s + (typeof r.monto === "number" ? r.monto : 0),
      0
    );
    if (Math.abs(sumaMedios - totalGeneral) > 0.01) {
      setError(`La suma de medios (${formatMoney(sumaMedios)}) no coincide con el total a cobrar (${formatMoney(totalGeneral)})`);
      return;
    }
    for (const m of medioRows) {
      if (typeof m.monto !== "number" || m.monto <= 0) {
        setError("Todos los medios deben tener monto > 0");
        return;
      }
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/cobranzas/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          tipo: "VIGENTES",
          persona_id: persona.id,
          observaciones: observaciones || null,
          medios: medioRows.map((r) => ({
            medio_cobro_id: r.medio_cobro_id,
            monto: r.monto,
            referencia: r.referencia || null,
          })),
          imputaciones: seleccionesArr.map((s) => ({
            cuota_id: s.cuota_id,
            modo: s.modo,
            monto_imputar: s.monto_imputar,
            bonif_punitorios: s.bonif_punitorios,
            bonif_motivo: s.bonif_motivo || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al registrar la cobranza");
        setSubmitting(false);
        return;
      }
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
        <p className="text-slate-500 text-sm mb-4">
          No tiene cuotas vencidas ni del mes corriente.
        </p>
        <Link
          href={`/cobranzas/nueva/adelanto?t=${tenant}&persona=${persona.id}`}
          className="inline-block px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg"
        >
          Adelantar cuotas →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="text-xs text-slate-500 mb-1">Cobrando a</div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">{persona.nombre}</div>
            {persona.cuit && <div className="text-xs text-slate-500">{persona.cuit}</div>}
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

      {/* Tabla de cuotas vigentes */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">
              Cuotas vigentes ({cuotasMostradas.length}{filtroLoteId ? ` de ${cuotas.length}` : ""})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Vencidas y del mes corriente · {Object.keys(selecciones).length} seleccionadas
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={tildarTodas}
              className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50"
            >
              Tildar {filtroLoteId ? "del lote" : "todas"}
            </button>
            {Object.keys(selecciones).length > 0 && (
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

        {/* Filtro de lotes (solo si hay >1) */}
        {lotes.length > 1 && (
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
            <div className="text-xs text-slate-500 mb-2">Filtrar por lote:</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => cambiarFiltro(null)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                  filtroLoteId === null
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                }`}
              >
                Todos los lotes ({cuotas.length})
              </button>
              {lotes.map((l) => {
                const cnt = cuotas.filter(c => c.lote_id === l.id).length;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => cambiarFiltro(l.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                      filtroLoteId === l.id
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {l.label} ({cnt})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {cuotasMostradas.map((c) => {
            const sel = selecciones[c.cuota_id];
            const seleccionada = !!sel;
            const isExpanded = expandedDetail === c.cuota_id;

            return (
              <div key={c.cuota_id} className={seleccionada ? "bg-brand-50/30" : ""}>
                <div className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={seleccionada}
                      onChange={() => toggleCuota(c)}
                      className="mt-1 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="font-medium text-slate-900">
                            Cuota {c.numero}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">
                            {c.proyecto_nombre} · {c.lote_manzana ? `M${c.lote_manzana}-` : ""}L{c.lote_numero}
                          </span>
                          {c.estado === "PAGA_PARCIAL" && (
                            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">
                              Pago parcial previo
                            </span>
                          )}
                        </div>
                        <span className="font-semibold text-slate-900">
                          {formatMoney(c.saldo_total_con_punitorios)}
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
                      
                      {/* Desglose colapsable */}
                      <button
                        type="button"
                        onClick={() => setExpandedDetail(isExpanded ? null : c.cuota_id)}
                        className="mt-2 text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        Ver desglose
                      </button>
                      {isExpanded && (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-1 text-xs bg-slate-50 p-2 rounded">
                          <div><span className="text-slate-500">Capital:</span> {formatMoney(c.capital_pendiente)}</div>
                          <div><span className="text-slate-500">IVA cap:</span> {formatMoney(c.iva_capital_pendiente)}</div>
                          <div><span className="text-slate-500">Interés:</span> {formatMoney(c.interes_pendiente)}</div>
                          <div><span className="text-slate-500">IVA int:</span> {formatMoney(c.iva_interes_pendiente)}</div>
                          <div><span className="text-slate-500">Ajuste:</span> {formatMoney(c.ajuste_pendiente)}</div>
                          <div><span className="text-slate-500">IVA aj:</span> {formatMoney(c.iva_ajuste_pendiente)}</div>
                          <div className="text-red-700"><span>Punit:</span> {formatMoney(c.punitorios_pendientes)}</div>
                          <div className="text-red-700"><span>IVA pun:</span> {formatMoney(c.iva_punitorios_pendientes)}</div>
                        </div>
                      )}

                      {/* Opciones cuando está seleccionada */}
                      {seleccionada && (
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                          {/* Total vs Parcial — solo si es la única seleccionada */}
                          {Object.keys(selecciones).length === 1 && (
                            <div className="flex gap-3 text-xs">
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={sel.modo === "TOTAL"}
                                  onChange={() => updateSeleccion(c.cuota_id, {
                                    modo: "TOTAL",
                                    monto_imputar: c.saldo_total_con_punitorios - sel.bonif_punitorios,
                                  })}
                                />
                                Total ({formatMoney(c.saldo_total_con_punitorios - sel.bonif_punitorios)})
                              </label>
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={sel.modo === "PARCIAL"}
                                  onChange={() => updateSeleccion(c.cuota_id, { modo: "PARCIAL" })}
                                />
                                Parcial
                              </label>
                            </div>
                          )}

                          {/* Monto a imputar (editable si parcial) */}
                          {sel.modo === "PARCIAL" && (
                            <div>
                              <label className="text-xs text-slate-600 mb-1 block">
                                Monto a pagar (mínimo: punitorios devengados)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={c.saldo_total_con_punitorios - sel.bonif_punitorios}
                                value={sel.monto_imputar || ""}
                                onChange={(e) => updateSeleccion(c.cuota_id, {
                                  monto_imputar: parseFloat(e.target.value) || 0,
                                })}
                                className="px-2 py-1 border border-slate-300 rounded text-sm w-48 focus:outline-none focus:ring-2 focus:ring-brand-500"
                              />
                              <span className="ml-2 text-xs text-slate-500">
                                Mínimo: {formatMoney((c.punitorios_pendientes + c.iva_punitorios_pendientes) - sel.bonif_punitorios)}
                              </span>
                            </div>
                          )}

                          {/* Bonificación de punitorios */}
                          {c.punitorios_pendientes > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-slate-600 mb-1 block">
                                  Bonificar punitorios (máx: {formatMoney(c.punitorios_pendientes + c.iva_punitorios_pendientes)})
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={c.punitorios_pendientes + c.iva_punitorios_pendientes}
                                  value={sel.bonif_punitorios || ""}
                                  onChange={(e) => {
                                    const newBonif = parseFloat(e.target.value) || 0;
                                    updateSeleccion(c.cuota_id, {
                                      bonif_punitorios: newBonif,
                                      monto_imputar: sel.modo === "TOTAL"
                                        ? c.saldo_total_con_punitorios - newBonif
                                        : sel.monto_imputar,
                                    });
                                  }}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-600 mb-1 block">
                                  Motivo {sel.bonif_punitorios > 0 && <span className="text-red-600">*</span>}
                                </label>
                                <input
                                  type="text"
                                  value={sel.bonif_motivo}
                                  onChange={(e) => updateSeleccion(c.cuota_id, { bonif_motivo: e.target.value })}
                                  placeholder="Día feriado, error, gracia, etc."
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Total esperado */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-brand-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-slate-600">Cuotas seleccionadas</div>
            <div className="text-xl font-bold text-slate-900">{Object.keys(selecciones).length}</div>
          </div>
          {totalBonificado > 0 && (
            <div>
              <div className="text-xs text-slate-600">Bonificado</div>
              <div className="text-xl font-bold text-amber-600">{formatMoney(totalBonificado)}</div>
            </div>
          )}
          <div className={totalBonificado > 0 ? "" : "md:col-span-2"}>
            <div className="text-xs text-slate-600">Total a cobrar</div>
            <div className="text-3xl font-bold text-brand-700">{formatMoney(totalGeneral)}</div>
          </div>
        </div>
      </div>

      {/* Multi medio */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <MultiMedioInput
          medios={medios}
          rows={medioRows}
          onChange={setMedioRows}
          totalEsperado={totalGeneral}
        />
      </div>

      {/* Observaciones */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <label className="text-xs text-slate-500 mb-1 block">Observaciones (opcional)</label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          placeholder="Notas internas..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Botones */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Link
            href={`/cobranzas?t=${tenant}`}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || totalGeneral <= 0}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Registrando..." : `Confirmar Cobro · ${formatMoney(totalGeneral)}`}
          </button>
        </div>
      </div>
    </form>
  );
}
