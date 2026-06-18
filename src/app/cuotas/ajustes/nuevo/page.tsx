"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  Percent,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  PlayCircle,
  Zap,
  RotateCcw,
} from "lucide-react";

type Simulacion = {
  cuotas_a_ajustar: number;
  contratos_a_ajustar: number;
  saldo_total_antes: string;
  ajuste_total: string;
  saldo_total_despues: string;
  coeficiente_oficial: string;
  coeficiente_aplicado: string;
  periodo_indice_usado: string;
};

function formatNumber(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "-";
  return num.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(coef: number | string): string {
  const num = typeof coef === "string" ? parseFloat(coef) : coef;
  if (isNaN(num)) return "-";
  return ((num - 1) * 100).toFixed(2) + "%";
}

function formatPeriodo(date: string): string {
  if (!date) return "-";
  const d = new Date(date);
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return meses[d.getMonth()] + "/" + d.getFullYear();
}

function periodoAYYYYMMDD(mesAnio: string): string {
  // Convierte "2026-06" a "2026-06-01"
  if (!mesAnio) return "";
  return mesAnio + "-01";
}

function NuevoAjustePageContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const tenant = sp.get("t") || "jacaranda";

  // Form
  const [indice, setIndice] = useState<string>("CAC");
  const [mesAnio, setMesAnio] = useState<string>(""); // YYYY-MM
  const [porcentaje, setPorcentaje] = useState<string>("");
  const [motivoDiferencia, setMotivoDiferencia] = useState<string>("");
  const [notas, setNotas] = useState<string>("");

  // Estado
  const [simulacion, setSimulacion] = useState<Simulacion | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const coefCalculado = porcentaje && !isNaN(parseFloat(porcentaje))
    ? 1 + parseFloat(porcentaje) / 100
    : null;

  // Detecta si el porcentaje aplicado difiere del oficial (despues de simular)
  const hayDiferencia = simulacion &&
    parseFloat(simulacion.coeficiente_oficial) !== parseFloat(simulacion.coeficiente_aplicado);

  async function handleSimular(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSimulacion(null);

    if (!indice || !mesAnio || !porcentaje) {
      setError("Completa todos los campos");
      return;
    }

    setSimulando(true);
    try {
      const res = await fetch("/api/cuotas/ajustes/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          indice,
          periodo_aplicacion: periodoAYYYYMMDD(mesAnio),
          porcentaje: parseFloat(porcentaje),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Error al simular");
        setSimulando(false);
        return;
      }
      setSimulacion(json.simulacion);
    } catch (err: any) {
      setError("Error de red: " + err.message);
    } finally {
      setSimulando(false);
    }
  }

  function abrirConfirmacion() {
    setError(null);
    // Si hay diferencia con el oficial, exigir motivo
    if (hayDiferencia && !motivoDiferencia.trim()) {
      setError("El coeficiente aplicado difiere del oficial. Tenes que indicar un motivo.");
      return;
    }
    setShowConfirm(true);
  }

  async function handleAplicar() {
    setError(null);
    setAplicando(true);
    try {
      const res = await fetch("/api/cuotas/ajustes/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          indice,
          periodo_aplicacion: periodoAYYYYMMDD(mesAnio),
          porcentaje: parseFloat(porcentaje),
          motivo_diferencia: hayDiferencia ? motivoDiferencia.trim() : null,
          notas: notas.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Error al aplicar");
        setAplicando(false);
        setShowConfirm(false);
        return;
      }
      // Redirect al detalle de la corrida recien creada
      router.push("/cuotas/ajustes/" + json.ajuste_id + "?t=" + tenant);
    } catch (err: any) {
      setError("Error de red: " + err.message);
      setAplicando(false);
      setShowConfirm(false);
    }
  }

  function resetForm() {
    setSimulacion(null);
    setError(null);
    setMotivoDiferencia("");
    setNotas("");
  }

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-4">
          <Link
            href={"/cuotas/ajustes?t=" + tenant}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition"
          >
            <ChevronLeft size={16} />
            Volver a Ajustes
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-brand-600 rounded-lg flex items-center justify-center">
              <Zap className="text-white" size={20} />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Nuevo ajuste</h1>
          </div>
          <p className="text-slate-500">
            Primero simula el ajuste para ver el impacto. Si los numeros son correctos, podes aplicarlo.
          </p>
        </div>

        {/* Form principal */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <form onSubmit={handleSimular} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Indice</label>
                <select
                  value={indice}
                  onChange={(e) => { setIndice(e.target.value); resetForm(); }}
                  disabled={simulacion !== null}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
                >
                  <option value="CAC">CAC</option>
                  <option value="CVS">CVS</option>
                  <option value="UVA">UVA</option>
                  <option value="IPC">IPC</option>
                  <option value="USD_OFICIAL">USD Oficial</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Periodo de aplicacion
                </label>
                <input
                  type="month"
                  value={mesAnio}
                  onChange={(e) => { setMesAnio(e.target.value); resetForm(); }}
                  disabled={simulacion !== null}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Mes que se ajusta. El sistema busca el indice publicado correspondiente.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Porcentaje a aplicar (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={porcentaje}
                  onChange={(e) => { setPorcentaje(e.target.value); resetForm(); }}
                  disabled={simulacion !== null}
                  required
                  placeholder="Ej: 2.0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
                />
                {coefCalculado !== null && (
                  <p className="text-xs text-slate-500 mt-1">
                    Coeficiente: {coefCalculado.toFixed(6)}
                  </p>
                )}
              </div>
            </div>

            {error && !showConfirm && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!simulacion ? (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={simulando}
                  className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-60"
                >
                  {simulando ? (
                    "Simulando..."
                  ) : (
                    <>
                      <PlayCircle size={16} />
                      Simular ajuste
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg transition"
                >
                  <RotateCcw size={14} />
                  Nueva simulacion
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Resultado de simulacion */}
        {simulacion && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="font-semibold text-slate-900">Resultado de la simulacion</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Estos numeros NO se aplicaron todavia. Es solo un calculo previo.
                </p>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="text-xs text-slate-500 mb-1">Cuotas a ajustar</div>
                    <div className="text-2xl font-bold text-slate-900">
                      {simulacion.cuotas_a_ajustar.toLocaleString("es-AR")}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="text-xs text-slate-500 mb-1">Contratos afectados</div>
                    <div className="text-2xl font-bold text-slate-900">
                      {simulacion.contratos_a_ajustar.toLocaleString("es-AR")}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Saldo total ANTES</div>
                    <div className="text-lg font-semibold text-slate-700 font-mono">
                      $ {formatNumber(simulacion.saldo_total_antes)}
                    </div>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3 -m-1 border border-emerald-200">
                    <div className="text-xs text-emerald-700 mb-1">Ajuste total</div>
                    <div className="text-lg font-semibold text-emerald-800 font-mono">
                      + $ {formatNumber(simulacion.ajuste_total)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Saldo total DESPUES</div>
                    <div className="text-lg font-semibold text-slate-900 font-mono">
                      $ {formatNumber(simulacion.saldo_total_despues)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm pb-4 border-b border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500">Coef. oficial</div>
                    <div className="font-medium text-slate-700">
                      {formatPct(simulacion.coeficiente_oficial)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Coef. aplicado</div>
                    <div className="font-medium text-slate-700">
                      {formatPct(simulacion.coeficiente_aplicado)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Indice publicado de</div>
                    <div className="font-medium text-slate-700">
                      {formatPeriodo(simulacion.periodo_indice_usado)}
                    </div>
                  </div>
                </div>

                {hayDiferencia && (
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-amber-800">
                        <strong>El coeficiente aplicado difiere del oficial.</strong>
                        {" "}Tenes que indicar el motivo antes de aplicar.
                      </div>
                    </div>
                    <label className="block text-xs font-medium text-amber-800 mb-1 mt-2">
                      Motivo de la diferencia <span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      value={motivoDiferencia}
                      onChange={(e) => setMotivoDiferencia(e.target.value)}
                      rows={2}
                      placeholder="Ej: ajuste especial por convenio, redondeo, etc."
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                )}

                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Notas (opcional)
                  </label>
                  <textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    rows={2}
                    placeholder="Comentarios internos sobre esta corrida..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm flex items-start gap-2 mb-4">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Link
                href={"/cuotas/ajustes?t=" + tenant}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancelar
              </Link>
              <button
                onClick={abrirConfirmacion}
                disabled={aplicando}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-60"
              >
                <Zap size={16} />
                Aplicar ajuste
              </button>
            </div>
          </>
        )}

        {/* Modal de confirmacion */}
        {showConfirm && simulacion && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Zap className="text-emerald-600" size={20} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Confirmar aplicacion</h2>
              </div>

              <p className="text-slate-600 mb-4">
                Vas a aplicar <strong>{formatPct(simulacion.coeficiente_aplicado)}</strong> de{" "}
                <strong>{indice}</strong> sobre <strong>{simulacion.cuotas_a_ajustar.toLocaleString("es-AR")}</strong> cuotas
                (<strong>{simulacion.contratos_a_ajustar.toLocaleString("es-AR")}</strong> contratos) que ajustan{" "}
                <strong>{formatPeriodo(periodoAYYYYMMDD(mesAnio))}</strong>.
              </p>

              <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">Saldo antes:</span>
                  <span className="font-mono">$ {formatNumber(simulacion.saldo_total_antes)}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-emerald-700">Ajuste:</span>
                  <span className="font-mono text-emerald-800 font-semibold">
                    + $ {formatNumber(simulacion.ajuste_total)}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-700 font-medium">Saldo despues:</span>
                  <span className="font-mono font-semibold">$ {formatNumber(simulacion.saldo_total_despues)}</span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                <strong>Atencion:</strong> esta accion modifica datos. Si necesitas revertirla,
                vas a poder hacerlo desde el detalle de la corrida.
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm mb-4 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={aplicando}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAplicar}
                  disabled={aplicando}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60"
                >
                  {aplicando ? "Aplicando..." : (
                    <>
                      <CheckCircle2 size={16} />
                      Si, aplicar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function NuevoAjustePage() {
  return (
    <Suspense fallback={null}>
      <NuevoAjustePageContent />
    </Suspense>
  );
}
