"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  Percent,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  FileText,
  TrendingUp,
  Filter,
  Search,
} from "lucide-react";

type AjusteHeader = {
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
  motivo_reversion: string | null;
  notas: string | null;
};

type ProyectoDisponible = {
  id: string;
  codigo: string;
  nombre: string;
};

type DetalleRow = {
  id: string;
  cuota_id: string;
  monto_total_antes: string;
  monto_pagado_antes: string;
  saldo_antes: string;
  ajuste_acumulado_antes: string;
  indice_factor_actual_antes: string | null;
  indice_periodo_base_antes: string | null;
  ajuste_aplicado: string;
  monto_total_despues: string;
  ajuste_acumulado_despues: string;
  indice_factor_actual_despues: string | null;
  cuota_numero: number;
  fecha_vto: string;
  cuota_estado: string;
  venta_nro: string;
  venta_id: string;
  proyecto_codigo: string;
  proyecto_nombre: string;
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

function formatFecha(date: string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleDateString("es-AR");
}

function formatFechaHora(date: string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleDateString("es-AR") + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
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
    <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium " + c.bg + " " + c.text}>
      <Icon size={12} />
      {estado}
    </span>
  );
}

function CuotaEstadoBadge({ estado }: { estado: string }) {
  // Estilos suaves para los estados de cuota (variados, no sabemos todos a priori)
  const config: Record<string, { bg: string; text: string }> = {
    PENDIENTE:       { bg: "bg-slate-100",   text: "text-slate-700"  },
    PAGADA:          { bg: "bg-emerald-100", text: "text-emerald-800" },
    PARCIAL:         { bg: "bg-amber-100",   text: "text-amber-800"  },
    PARCIAL_PAGADA:  { bg: "bg-amber-100",   text: "text-amber-800"  },
    VENCIDA:         { bg: "bg-rose-100",    text: "text-rose-800"   },
    ANULADA:         { bg: "bg-slate-200",   text: "text-slate-600"  },
  };
  const c = config[estado] || { bg: "bg-slate-100", text: "text-slate-700" };
  return (
    <span className={"inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium " + c.bg + " " + c.text}>
      {estado}
    </span>
  );
}

const PAGE_SIZE = 50;

export default function AjusteDetallePage() {
  const sp = useSearchParams();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const tenant = sp.get("t") || "jacaranda";
  const ajusteId = params.id;

  const [header, setHeader] = useState<AjusteHeader | null>(null);
  const [proyectosDisponibles, setProyectosDisponibles] = useState<ProyectoDisponible[]>([]);
  const [estadosDisponibles, setEstadosDisponibles] = useState<string[]>([]);
  const [detalle, setDetalle] = useState<DetalleRow[]>([]);
  const [totalDetalle, setTotalDetalle] = useState(0);
  const [sinFiltros, setSinFiltros] = useState(true);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros (estado en UI = lo que el usuario tipeó, todavia no aplicado)
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroVenta, setFiltroVenta] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroVencimiento, setFiltroVencimiento] = useState("");

  // Filtros aplicados (lo que se envia al endpoint)
  const [aplicadoProyecto, setAplicadoProyecto] = useState("");
  const [aplicadoVenta, setAplicadoVenta] = useState("");
  const [aplicadoEstado, setAplicadoEstado] = useState("");
  const [aplicadoVencimiento, setAplicadoVencimiento] = useState("");

  // Modal revertir
  const [showRevertir, setShowRevertir] = useState(false);

  async function cargar(pageNum: number, filtros: { proyecto: string; venta: string; estado: string; vencimiento: string }) {
    setLoading(true);
    setErrorCarga(null);
    try {
      const qs = new URLSearchParams();
      qs.set("t", tenant);
      qs.set("page", String(pageNum));
      qs.set("pageSize", String(PAGE_SIZE));
      if (filtros.proyecto) qs.set("proyecto_id", filtros.proyecto);
      if (filtros.venta.trim()) qs.set("venta_nro", filtros.venta.trim());
      if (filtros.estado) qs.set("cuota_estado", filtros.estado);
      if (filtros.vencimiento) qs.set("vencimiento", filtros.vencimiento);

      const url = "/api/cuotas/ajustes/detalle/" + ajusteId + "?" + qs.toString();
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorCarga(json.error || "Error al cargar el detalle");
        setLoading(false);
        return;
      }
      setHeader(json.header);
      setProyectosDisponibles(json.proyectos_disponibles || []);
      setEstadosDisponibles(json.estados_disponibles || []);
      setDetalle(json.detalle || []);
      setTotalDetalle(json.total_detalle || 0);
      setSinFiltros(json.sin_filtros !== false ? true : false);
      setPage(pageNum);
    } catch (err: any) {
      setErrorCarga("Error de red: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar(1, { proyecto: "", venta: "", estado: "", vencimiento: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, ajusteId]);

  function aplicarFiltros(e: React.FormEvent) {
    e.preventDefault();
    setAplicadoProyecto(filtroProyecto);
    setAplicadoVenta(filtroVenta);
    setAplicadoEstado(filtroEstado);
    setAplicadoVencimiento(filtroVencimiento);
    cargar(1, { proyecto: filtroProyecto, venta: filtroVenta, estado: filtroEstado, vencimiento: filtroVencimiento });
  }

  function resetFiltros() {
    setFiltroProyecto("");
    setFiltroVenta("");
    setFiltroEstado("");
    setFiltroVencimiento("");
    setAplicadoProyecto("");
    setAplicadoVenta("");
    setAplicadoEstado("");
    setAplicadoVencimiento("");
    cargar(1, { proyecto: "", venta: "", estado: "", vencimiento: "" });
  }

  function cambiarPagina(nueva: number) {
    cargar(nueva, { proyecto: aplicadoProyecto, venta: aplicadoVenta, estado: aplicadoEstado, vencimiento: aplicadoVencimiento });
  }

  const totalPages = Math.max(1, Math.ceil(totalDetalle / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const hayFiltroAplicado = !!(aplicadoProyecto || aplicadoVenta || aplicadoEstado || aplicadoVencimiento);

  if (loading && !header) {
    return (
      <AppShell>
        <div className="p-8 max-w-7xl mx-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
            Cargando detalle...
          </div>
        </div>
      </AppShell>
    );
  }

  if (errorCarga || !header) {
    return (
      <AppShell>
        <div className="p-8 max-w-7xl mx-auto">
          <div className="mb-4">
            <Link
              href={"/cuotas/ajustes?t=" + tenant}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition"
            >
              <ChevronLeft size={16} />
              Volver a Ajustes
            </Link>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-rose-700">
            <div className="flex items-start gap-2">
              <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold mb-1">No se pudo cargar el detalle</div>
                <div className="text-sm">{errorCarga || "Corrida no encontrada"}</div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const hayDiferencia = parseFloat(header.coeficiente_oficial) !== parseFloat(header.coeficiente_aplicado);

  return (
    <AppShell>
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-4">
          <Link
            href={"/cuotas/ajustes?t=" + tenant}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition"
          >
            <ChevronLeft size={16} />
            Volver a Ajustes
          </Link>
        </div>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-brand-600 rounded-lg flex items-center justify-center">
                <Percent className="text-white" size={20} />
              </div>
              <h1 className="text-3xl font-bold text-slate-900">
                Ajuste {header.indice} - {formatPeriodo(header.periodo_aplicacion)}
              </h1>
              <EstadoBadge estado={header.estado} />
            </div>
            <p className="text-slate-500 text-sm">
              ID: <span className="font-mono">{header.id}</span>
            </p>
          </div>
          {header.estado === "EJECUTADA" && (
            <button
              onClick={() => setShowRevertir(true)}
              className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition whitespace-nowrap"
            >
              <RotateCcw size={16} />
              Revertir corrida
            </button>
          )}
        </div>

        {/* Encabezado de la corrida */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Cuotas afectadas</div>
            <div className="text-2xl font-bold text-slate-900">
              {header.cuotas_afectadas.toLocaleString("es-AR")}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Contratos</div>
            <div className="text-2xl font-bold text-slate-900">
              {header.contratos_afectados.toLocaleString("es-AR")}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Coef. aplicado</div>
            <div className="text-2xl font-bold text-slate-900">
              {formatPct(header.coeficiente_aplicado)}
            </div>
            {hayDiferencia && (
              <div className="text-xs text-amber-600 mt-1">
                Oficial: {formatPct(header.coeficiente_oficial)}
              </div>
            )}
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
            <div className="text-xs text-emerald-700 mb-1">Ajuste total</div>
            <div className="text-2xl font-bold text-emerald-800 font-mono">
              $ {formatNumber(header.ajuste_total_aplicado)}
            </div>
          </div>
        </div>

        {/* Datos de la corrida */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={18} className="text-slate-500" />
            <h3 className="font-semibold text-slate-900">Datos de la corrida</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-500">Indice publicado de</div>
              <div className="font-medium text-slate-900">
                {formatPeriodo(header.periodo_indice_usado)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Saldo antes</div>
              <div className="font-medium text-slate-900 font-mono">
                $ {formatNumber(header.monto_saldo_antes)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Saldo despues</div>
              <div className="font-medium text-slate-900 font-mono">
                $ {formatNumber(header.monto_saldo_despues)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Creado</div>
              <div className="text-slate-700">{formatFechaHora(header.creado_at)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Ejecutado</div>
              <div className="text-slate-700">{formatFechaHora(header.ejecutado_at)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Revertido</div>
              <div className="text-slate-700">{formatFechaHora(header.revertido_at)}</div>
            </div>
          </div>

          {header.motivo_diferencia && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <div className="font-medium text-amber-800 mb-1">
                    Motivo de la diferencia con el oficial
                  </div>
                  <div className="text-amber-700">{header.motivo_diferencia}</div>
                </div>
              </div>
            </div>
          )}

          {header.motivo_reversion && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <History size={16} className="text-slate-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <div className="font-medium text-slate-800 mb-1">Motivo de la reversion</div>
                  <div className="text-slate-700">{header.motivo_reversion}</div>
                </div>
              </div>
            </div>
          )}

          {header.notas && (
            <div className="mt-4 text-sm">
              <div className="text-xs text-slate-500 mb-1">Notas</div>
              <div className="text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">
                {header.notas}
              </div>
            </div>
          )}
        </div>

        {/* Detalle de cuotas */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-slate-500" />
              <h3 className="font-semibold text-slate-900">Cuotas afectadas</h3>
              {hayFiltroAplicado && (
                <span className="text-xs px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full">
                  filtrado
                </span>
              )}
            </div>
            {hayFiltroAplicado && (
              <span className="text-sm text-slate-500">
                {totalDetalle.toLocaleString("es-AR")} cuota{totalDetalle === 1 ? "" : "s"}
                {" de "}
                {header.cuotas_afectadas.toLocaleString("es-AR")}
              </span>
            )}
          </div>

          {/* Filtros */}
          <div className="px-6 py-4 border-b border-slate-200 bg-white">
            <form onSubmit={aplicarFiltros}>
              <div className="flex items-center gap-2 mb-3">
                <Filter size={14} className="text-slate-500" />
                <span className="text-xs text-slate-600 font-medium">Filtros</span>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="min-w-[200px]">
                  <label className="text-xs text-slate-500 mb-1 block">Proyecto</label>
                  <select
                    value={filtroProyecto}
                    onChange={(e) => setFiltroProyecto(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Todos ({proyectosDisponibles.length})</option>
                    {proyectosDisponibles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} - {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Nro venta</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={filtroVenta}
                      onChange={(e) => setFiltroVenta(e.target.value)}
                      placeholder="Ej: 2024-1234"
                      className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white w-40"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Estado cuota</label>
                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Todos</option>
                    {estadosDisponibles.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Vencimiento</label>
                  <select
                    value={filtroVencimiento}
                    onChange={(e) => setFiltroVencimiento(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Todas</option>
                    <option value="vencida">Vencidas</option>
                    <option value="al_dia">Al dia</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
                  >
                    Aplicar
                  </button>
                  {hayFiltroAplicado && (
                    <button
                      type="button"
                      onClick={resetFiltros}
                      className="text-sm text-slate-600 hover:bg-slate-100 px-3 py-1.5 border border-slate-300 rounded-lg transition"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>

          {/* Tabla / Estados */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Cargando...</div>
          ) : sinFiltros && !hayFiltroAplicado ? (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 rounded-full mb-3">
                <Filter size={20} className="text-slate-400" />
              </div>
              <div className="text-slate-600 text-sm font-medium mb-1">
                Aplica al menos un filtro para ver cuotas
              </div>
              <div className="text-slate-400 text-xs max-w-md mx-auto">
                Esta corrida tiene {header.cuotas_afectadas.toLocaleString("es-AR")} cuotas afectadas.
                Para evitar cargar todo, eligi un proyecto, buscá una venta o filtra por estado.
              </div>
            </div>
          ) : detalle.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Ninguna cuota coincide con los filtros aplicados.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Proyecto</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Venta</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-600">Cuota</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Vto.</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-600">Estado</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Total antes</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Ajuste</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Total despues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((d) => (
                      <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5 text-slate-700">
                          <span className="font-mono text-xs text-slate-500">{d.proyecto_codigo}</span>
                          <div className="text-xs text-slate-600">{d.proyecto_nombre}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={"/ventas/" + d.venta_id + "?t=" + tenant}
                            className="text-brand-600 hover:text-brand-700 font-medium"
                          >
                            {d.venta_nro}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-700">{d.cuota_numero}</td>
                        <td className="px-4 py-2.5 text-slate-700 text-xs">
                          {(() => {
                            if (!d.fecha_vto) return <span className="text-slate-400">-</span>;
                            const vtoDate = new Date(d.fecha_vto);
                            const hoy = new Date();
                            hoy.setHours(0, 0, 0, 0);
                            const vencida = vtoDate < hoy;
                            return (
                              <span className={vencida ? "text-amber-700 font-medium" : "text-slate-700"}>
                                {formatFecha(d.fecha_vto)}
                                {vencida && <span className="ml-1 text-amber-600" title="Vencida">âš </span>}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <CuotaEstadoBadge estado={d.cuota_estado} />
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600 font-mono text-xs">
                          $ {formatNumber(d.monto_total_antes)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-700 font-mono text-xs font-semibold">
                          + $ {formatNumber(d.ajuste_aplicado)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-900 font-mono text-xs font-semibold">
                          $ {formatNumber(d.monto_total_despues)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    Pagina {page} de {totalPages}
                    <span className="ml-2 text-slate-400">
                      ({start + 1}-{Math.min(start + PAGE_SIZE, totalDetalle)} de {totalDetalle})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => cambiarPagina(Math.max(1, page - 1))}
                      disabled={page === 1 || loading}
                      className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => cambiarPagina(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages || loading}
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

        {/* Modal revertir */}
        {showRevertir && (
          <ModalRevertir
            tenant={tenant}
            ajusteId={header.id}
            indice={header.indice}
            periodo={header.periodo_aplicacion}
            onClose={() => setShowRevertir(false)}
            onReverted={() => {
              setShowRevertir(false);
              cargar(page, { proyecto: aplicadoProyecto, venta: aplicadoVenta, estado: aplicadoEstado, vencimiento: aplicadoVencimiento });
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

// ============================================================================
// Modal de reversion
// ============================================================================
function ModalRevertir({
  tenant,
  ajusteId,
  indice,
  periodo,
  onClose,
  onReverted,
}: {
  tenant: string;
  ajusteId: string;
  indice: string;
  periodo: string;
  onClose: () => void;
  onReverted: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevertir() {
    setError(null);
    if (!motivo.trim()) {
      setError("El motivo de la reversion es obligatorio.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/cuotas/ajustes/revertir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          ajuste_id: ajusteId,
          motivo_reversion: motivo.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Error al revertir");
        setSubmitting(false);
        return;
      }
      onReverted();
    } catch (err: any) {
      setError("Error de red: " + err.message);
      setSubmitting(false);
    }
  }

  function formatPeriodoLocal(date: string): string {
    if (!date) return "-";
    const d = new Date(date);
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return meses[d.getMonth()] + "/" + d.getFullYear();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
            <RotateCcw className="text-rose-600" size={20} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Revertir corrida</h2>
        </div>

        <p className="text-slate-600 mb-4">
          Vas a revertir el ajuste de <strong>{indice}</strong> aplicado a{" "}
          <strong>{formatPeriodoLocal(periodo)}</strong>. Las cuotas afectadas
          volveran a su estado anterior.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
          <strong>Atencion:</strong> esta accion modifica datos. Una vez revertida,
          la corrida queda en estado REVERTIDA pero no se borra del historial.
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Motivo de la reversion <span className="text-rose-600">*</span>
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej: ajuste cargado con coeficiente incorrecto, error en el indice publicado, etc."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={submitting}
            required
          />
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm mb-4 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleRevertir}
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60"
          >
            {submitting ? "Revirtiendo..." : (
              <>
                <RotateCcw size={16} />
                Si, revertir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
