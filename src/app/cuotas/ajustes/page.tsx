"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  Percent,
  Plus,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  Filter,
} from "lucide-react";

type AjusteEjecucion = {
  id: string;
  indice: string;
  periodo_aplicacion: string;
  periodo_indice_usado: string;
  coeficiente_oficial: string;
  coeficiente_aplicado: string;
  motivo_diferencia: string | null;
  estado: string;
  cuotas_afectadas: number;
  contratos_afectados: number;
  monto_saldo_antes: string;
  monto_saldo_despues: string;
  ajuste_total_aplicado: string;
  creado_at: string;
  ejecutado_at: string | null;
  revertido_at: string | null;
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

function EstadoBadge({ estado }: { estado: string }) {
  const config: Record<string, { bg: string; text: string; icon: any }> = {
    EJECUTADA:     { bg: "bg-emerald-100", text: "text-emerald-800", icon: CheckCircle2 },
    EN_SIMULACION: { bg: "bg-amber-100",   text: "text-amber-800",   icon: Clock },
    REVERTIDA:     { bg: "bg-slate-100",   text: "text-slate-700",   icon: History },
    CANCELADA:     { bg: "bg-rose-100",    text: "text-rose-800",    icon: XCircle },
  };
  const c = config[estado] || config.CANCELADA;
  const Icon = c.icon;
  return (
    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium " + c.bg + " " + c.text}>
      <Icon size={12} />
      {estado}
    </span>
  );
}

const PAGE_SIZE = 20;

function AjustesListadoPageContent() {
  const sp = useSearchParams();
  const tenant = sp.get("t") || "jacaranda";

  const [corridas, setCorridas] = useState<AjusteEjecucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filtros
  const [filtroIndice, setFiltroIndice] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [filtroDesde, setFiltroDesde] = useState<string>("");
  const [filtroHasta, setFiltroHasta] = useState<string>("");

  async function cargar() {
    setLoading(true);
    setPage(1);
    try {
      const params = new URLSearchParams();
      params.set("t", tenant);
      params.set("limit", "200");
      if (filtroIndice) params.set("indice", filtroIndice);
      if (filtroEstado) params.set("estado", filtroEstado);
      if (filtroDesde) params.set("desde", filtroDesde);
      if (filtroHasta) params.set("hasta", filtroHasta);

      const res = await fetch("/api/cuotas/ajustes/listar?" + params.toString());
      const json = await res.json();
      setCorridas(json.items || []);
    } catch (err) {
      console.error("Error cargando ajustes:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  function aplicarFiltros(e: React.FormEvent) {
    e.preventDefault();
    cargar();
  }

  function resetFiltros() {
    setFiltroIndice("");
    setFiltroEstado("");
    setFiltroDesde("");
    setFiltroHasta("");
    // Re-cargar despues de limpiar
    setTimeout(cargar, 0);
  }

  // Paginacion client-side
  const totalPages = Math.max(1, Math.ceil(corridas.length / PAGE_SIZE));
  const pageActual = Math.min(page, totalPages);
  const start = (pageActual - 1) * PAGE_SIZE;
  const corridasPagina = corridas.slice(start, start + PAGE_SIZE);

  return (
    <AppShell>
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-4">
          <Link
            href={"/cuotas?t=" + tenant}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition"
          >
            <ChevronLeft size={16} />
            Volver a Cuotas
          </Link>
        </div>

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-brand-600 rounded-lg flex items-center justify-center">
                <Percent className="text-white" size={20} />
              </div>
              <h1 className="text-3xl font-bold text-slate-900">Ajustes de Cuotas</h1>
            </div>
            <p className="text-slate-500">
              Historial de corridas de ajuste mensual aplicadas o simuladas.
            </p>
          </div>
          <Link
            href={"/cuotas/ajustes/nuevo?t=" + tenant}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition whitespace-nowrap"
          >
            <Plus size={16} />
            Nuevo ajuste
          </Link>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <form onSubmit={aplicarFiltros}>
            <div className="flex items-center gap-2 mb-3">
              <Filter size={16} className="text-slate-500" />
              <span className="text-sm text-slate-600 font-medium">Filtros</span>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Indice</label>
                <select
                  value={filtroIndice}
                  onChange={(e) => setFiltroIndice(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Todos</option>
                  <option value="CAC">CAC</option>
                  <option value="CVS">CVS</option>
                  <option value="UVA">UVA</option>
                  <option value="IPC">IPC</option>
                  <option value="USD_OFICIAL">USD Oficial</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Estado</label>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Todos</option>
                  <option value="EJECUTADA">Ejecutada</option>
                  <option value="EN_SIMULACION">En simulacion</option>
                  <option value="REVERTIDA">Revertida</option>
                  <option value="CANCELADA">Cancelada</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Periodo desde</label>
                <input
                  type="date"
                  value={filtroDesde}
                  onChange={(e) => setFiltroDesde(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Periodo hasta</label>
                <input
                  type="date"
                  value={filtroHasta}
                  onChange={(e) => setFiltroHasta(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  onClick={resetFiltros}
                  className="text-sm text-slate-600 hover:bg-slate-100 px-3 py-1.5 border border-slate-300 rounded-lg transition"
                >
                  Reset
                </button>
              </div>
              <span className="text-sm text-slate-500 ml-auto self-center">
                {loading ? "Cargando..." : corridas.length + " corrida" + (corridas.length === 1 ? "" : "s")}
              </span>
            </div>
          </form>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Cargando...</div>
          ) : corridas.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-slate-400 text-sm mb-3">
                No hay corridas registradas con esos filtros.
              </div>
              <Link
                href={"/cuotas/ajustes/nuevo?t=" + tenant}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                <Plus size={16} />
                Aplicar primer ajuste
              </Link>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-slate-600">Periodo</th>
                    <th className="text-left px-6 py-3 font-medium text-slate-600">Indice</th>
                    <th className="text-right px-6 py-3 font-medium text-slate-600">Coef. aplicado</th>
                    <th className="text-right px-6 py-3 font-medium text-slate-600">Cuotas</th>
                    <th className="text-right px-6 py-3 font-medium text-slate-600">Contratos</th>
                    <th className="text-right px-6 py-3 font-medium text-slate-600">Ajuste $</th>
                    <th className="text-center px-6 py-3 font-medium text-slate-600">Estado</th>
                    <th className="text-center px-6 py-3 font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {corridasPagina.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50 transition">
                      <td className="px-6 py-3 font-medium text-slate-900">
                        {formatPeriodo(c.periodo_aplicacion)}
                      </td>
                      <td className="px-6 py-3 text-slate-700">{c.indice}</td>
                      <td className="px-6 py-3 text-right text-slate-700">
                        {formatPct(c.coeficiente_aplicado)}
                        {c.motivo_diferencia && (
                          <span className="ml-1 text-xs text-amber-600" title={c.motivo_diferencia}>*</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-700">
                        {c.cuotas_afectadas?.toLocaleString("es-AR") || "-"}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-700">
                        {c.contratos_afectados?.toLocaleString("es-AR") || "-"}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-700 font-mono">
                        $ {formatNumber(c.ajuste_total_aplicado)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <EstadoBadge estado={c.estado} />
                      </td>
                      <td className="px-6 py-3 text-center">
                        <Link
                          href={"/cuotas/ajustes/" + c.id + "?t=" + tenant}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium"
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    Pagina {pageActual} de {totalPages}
                    <span className="ml-2 text-slate-400">
                      ({start + 1}-{Math.min(start + PAGE_SIZE, corridas.length)} de {corridas.length})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, pageActual - 1))}
                      disabled={pageActual === 1}
                      className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage(Math.min(totalPages, pageActual + 1))}
                      disabled={pageActual === totalPages}
                      className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {corridas.some((c) => c.motivo_diferencia) && (
          <p className="text-xs text-slate-400 mt-3">
            <span className="text-amber-600">*</span> El coeficiente aplicado difiere del oficial publicado.
            Pasa el mouse sobre el asterisco para ver el motivo.
          </p>
        )}
      </div>
    </AppShell>
  );
}

export default function AjustesListadoPage() {
  return (
    <Suspense fallback={null}>
      <AjustesListadoPageContent />
    </Suspense>
  );
}
