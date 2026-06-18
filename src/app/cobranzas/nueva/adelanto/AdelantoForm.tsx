"use client";

import { useState, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { MultiMedioInput, MedioRow, Medio } from "@/components/MultiMedioInput";

type CuotaFutura = {
  cuota_id: string;
  numero: number;
  fecha_vto: string;
  proyecto_nombre: string;
  lote_id: string;
  lote_numero: string;
  lote_manzana: string | null;
  monto_cuota: number;
  capital: number;
  iva_capital: number;
  interes: number;
  iva_interes: number;
  ajuste: number;
  iva_ajuste: number;
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

export function AdelantoForm({
  tenant,
  persona,
  cuotas,
  medios,
}: {
  tenant: string;
  persona: Persona;
  cuotas: CuotaFutura[];
  medios: Medio[];
}) {
  const router = useRouter();
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [medioRows, setMedioRows] = useState<MedioRow[]>([]);
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroLoteId, setFiltroLoteId] = useState<string | null>(null);

  // Lista única de lotes con etiquetas
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

  // Cuotas a mostrar (todas o filtradas por lote). Mantienen el orden DESC global.
  const cuotasMostradas = useMemo(() => {
    if (!filtroLoteId) return cuotas;
    return cuotas.filter(c => c.lote_id === filtroLoteId);
  }, [cuotas, filtroLoteId]);

  // Cuotas agrupadas por lote en orden DESC (para validación de cascada por lote)
  const cuotasPorLote = useMemo(() => {
    const map = new Map<string, CuotaFutura[]>();
    for (const c of cuotas) {
      if (!map.has(c.lote_id)) map.set(c.lote_id, []);
      map.get(c.lote_id)!.push(c);
    }
    // El array por lote ya viene DESC porque cuotas viene DESC
    return map;
  }, [cuotas]);

  function cambiarFiltro(loteId: string | null) {
    // Destildar las selecciones que no estén en el lote nuevo (si hay filtro)
    if (loteId) {
      const cuotasDelLote = new Set(
        cuotas.filter(c => c.lote_id === loteId).map(c => c.cuota_id)
      );
      const next = new Set<string>();
      for (const id of seleccionadas) {
        if (cuotasDelLote.has(id)) next.add(id);
      }
      setSeleccionadas(next);
    }
    setError(null);
    setFiltroLoteId(loteId);
  }

  const total = useMemo(() => {
    return cuotas
      .filter((c) => seleccionadas.has(c.cuota_id))
      .reduce((s, c) => s + c.monto_cuota, 0);
  }, [cuotas, seleccionadas]);

  function toggleCuota(cuota: CuotaFutura) {
    const cuota_id = cuota.cuota_id;
    const next = new Set(seleccionadas);
    
    // Cuotas del mismo lote (en cualquier orden, vamos a usar numero)
    const cuotasLote = cuotasPorLote.get(cuota.lote_id) || [];
    
    if (next.has(cuota_id)) {
      // DESTILDANDO la cuota N:
      // Para que la selección siga siendo válida (bloque consecutivo desde la más alta),
      // ninguna cuota con número MENOR a N del mismo lote puede estar tildada.
      // Si alguna está, primero hay que destildar la más baja.
      const menoresTildadas = cuotasLote.filter(
        c => c.numero < cuota.numero && next.has(c.cuota_id)
      );
      if (menoresTildadas.length > 0) {
        // La cuota más baja tildada es la que hay que destildar primero
        const masBaja = menoresTildadas.reduce(
          (min, c) => c.numero < min.numero ? c : min,
          menoresTildadas[0]
        );
        setError(`Para destildar la cuota ${cuota.numero}, primero destildá la cuota ${masBaja.numero} del mismo lote`);
        return;
      }
      next.delete(cuota_id);
    } else {
      // TILDANDO la cuota N:
      // Todas las cuotas con número MAYOR a N del mismo lote deben estar tildadas
      // (eso significa que estoy llenando el bloque consecutivo desde la más alta).
      const mayoresDestildadas = cuotasLote.filter(
        c => c.numero > cuota.numero && !next.has(c.cuota_id)
      );
      if (mayoresDestildadas.length > 0) {
        // La cuota mayor más cercana es la que hay que tildar primero
        const masCercana = mayoresDestildadas.reduce(
          (min, c) => c.numero < min.numero ? c : min,
          mayoresDestildadas[0]
        );
        setError(`Para adelantar la cuota ${cuota.numero}, primero seleccioná la cuota ${masCercana.numero} del mismo lote (empezar por la última)`);
        return;
      }
      next.add(cuota_id);
    }
    setError(null);
    setSeleccionadas(next);
  }

  function tildarTodas() {
    // Tilda todas las cuotas mostradas (respeta el filtro si hay)
    const next = new Set(seleccionadas);
    for (const c of cuotasMostradas) next.add(c.cuota_id);
    setSeleccionadas(next);
  }

  function limpiar() {
    setSeleccionadas(new Set());
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (seleccionadas.size === 0) {
      setError("Tenés que seleccionar al menos una cuota para adelantar");
      return;
    }

    const sumaMedios = medioRows.reduce(
      (s, r) => s + (typeof r.monto === "number" ? r.monto : 0),
      0
    );
    if (Math.abs(sumaMedios - total) > 0.01) {
      setError(`La suma de medios (${formatMoney(sumaMedios)}) no coincide con el total (${formatMoney(total)})`);
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
      const seleccionesArr = cuotas
        .filter((c) => seleccionadas.has(c.cuota_id))
        .map((c) => ({
          cuota_id: c.cuota_id,
          modo: "TOTAL" as const,
          monto_imputar: c.monto_cuota,
          bonif_punitorios: 0,
          bonif_motivo: null,
        }));

      const res = await fetch("/api/cobranzas/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          tipo: "ADELANTO",
          persona_id: persona.id,
          observaciones: observaciones || null,
          medios: medioRows.map((r) => ({
            medio_cobro_id: r.medio_cobro_id,
            monto: r.monto,
            referencia: r.referencia || null,
          })),
          imputaciones: seleccionesArr,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al registrar el adelanto");
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
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          No hay cuotas para adelantar
        </h2>
        <p className="text-slate-500 text-sm">
          Este cliente no tiene cuotas futuras pendientes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="text-xs text-slate-500 mb-1">Adelanto de cuotas para</div>
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

      {/* Aviso de cuota completa */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex gap-2">
          <AlertTriangle size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <strong>Reglas del adelanto:</strong> solo se permite cuota completa (no parcial)
            y debe empezarse por la cuota más lejana en el tiempo. Para tildar la cuota N
            tenés que tener tildadas todas las posteriores (N+1, N+2, etc.).
          </div>
        </div>
      </div>

      {/* Tabla invertida */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">
              Cuotas futuras ({cuotasMostradas.length}{filtroLoteId ? ` de ${cuotas.length}` : ""})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Orden inverso: de la última a la próxima · {seleccionadas.size} seleccionadas
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

        <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
          {cuotasMostradas.map((c) => {
            const sel = seleccionadas.has(c.cuota_id);
            return (
              <label
                key={c.cuota_id}
                className={`block px-4 py-3 cursor-pointer transition ${
                  sel ? "bg-brand-50/50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => toggleCuota(c)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-900">
                        Cuota {c.numero}
                      </span>
                      <span className="text-xs text-slate-500 ml-2">
                        {c.proyecto_nombre} · {c.lote_manzana ? `M${c.lote_manzana}-` : ""}L{c.lote_numero} · Vto: {formatDate(c.fecha_vto)}
                      </span>
                    </div>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(c.monto_cuota)}
                    </span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Total */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-brand-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-600">Cuotas a adelantar</div>
            <div className="text-xl font-bold text-slate-900">{seleccionadas.size}</div>
          </div>
          <div>
            <div className="text-xs text-slate-600">Total a cobrar</div>
            <div className="text-3xl font-bold text-brand-700">{formatMoney(total)}</div>
          </div>
        </div>
      </div>

      {/* Multi medio */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <MultiMedioInput
          medios={medios}
          rows={medioRows}
          onChange={setMedioRows}
          totalEsperado={total}
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
            disabled={submitting || total <= 0}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Registrando..." : `Confirmar Adelanto · ${formatMoney(total)}`}
          </button>
        </div>
      </div>
    </form>
  );
}
