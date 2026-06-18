"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  Percent,
  Calendar,
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";

type IndiceValor = {
  id: string;
  indice: string;
  periodo: string;
  coeficiente: string;
  valor_acumulado: string | null;
  fuente: string | null;
  fecha_publicacion: string | null;
};

function formatPeriodo(date: string): string {
  if (!date) return "-";
  const d = new Date(date);
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return meses[d.getMonth()] + "/" + d.getFullYear();
}

function periodoToInputMonth(date: string): string {
  if (!date) return "";
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return y + "-" + m;
}

function formatPct(coef: number | string): string {
  const num = typeof coef === "string" ? parseFloat(coef) : coef;
  if (isNaN(num)) return "-";
  return ((num - 1) * 100).toFixed(2) + "%";
}

function coefToPct(coef: string | number): number {
  const num = typeof coef === "string" ? parseFloat(coef) : coef;
  if (isNaN(num)) return 0;
  return parseFloat(((num - 1) * 100).toFixed(4));
}

function mesQueAjusta(periodoStr: string, indice: string): string {
  if (!periodoStr) return "-";
  const d = new Date(periodoStr);
  const desfase = indice === "CVS" ? 3 : indice === "CAC" ? 2 : 1;
  d.setMonth(d.getMonth() + desfase);
  return formatPeriodo(d.toISOString());
}

export default function IndicesPage() {
  const sp = useSearchParams();
  const tenant = sp.get("t") || "jacaranda";

  const [indices, setIndices] = useState<IndiceValor[]>([]);
  const [filtroIndice, setFiltroIndice] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<IndiceValor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IndiceValor | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      let url = "/api/cuotas/indices/listar?limit=500";
      if (filtroIndice) url += "&indice=" + filtroIndice;
      const res = await fetch(url);
      const json = await res.json();
      setIndices(json.items || []);
    } catch (err) {
      console.error("Error cargando indices:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
  }, [filtroIndice]);

  function abrirModalNuevo() {
    setEditingItem(null);
    setShowModal(true);
  }

  function abrirModalEditar(item: IndiceValor) {
    setEditingItem(item);
    setShowModal(true);
  }

  function cerrarModal() {
    setShowModal(false);
    setEditingItem(null);
  }

  const ultimosPorIndice: Record<string, string> = {};
  for (const item of indices) {
    if (!ultimosPorIndice[item.indice] || item.periodo > ultimosPorIndice[item.indice]) {
      ultimosPorIndice[item.indice] = item.periodo;
    }
  }

  // Orden visual de la tabla: periodo DESC (mas recientes arriba), independiente del indice.
  // Si hay empate de periodo, desempata por indice para que el orden sea estable.
  const indicesOrdenados = [...indices].sort((a, b) => {
    if (a.periodo !== b.periodo) return b.periodo.localeCompare(a.periodo);
    return a.indice.localeCompare(b.indice);
  });

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
                <Calendar className="text-white" size={20} />
              </div>
              <h1 className="text-3xl font-bold text-slate-900">Indices Mensuales</h1>
            </div>
            <p className="text-slate-500">
              Valores publicados de CAC y CVS. El coeficiente se guarda como factor (ej: 2% &rarr; 1.020).
            </p>
          </div>
          <button
            onClick={abrirModalNuevo}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition whitespace-nowrap"
          >
            <Plus size={16} />
            Nuevo valor
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-600 font-medium">Filtrar por indice:</span>
            <select
              value={filtroIndice}
              onChange={(e) => setFiltroIndice(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              <option value="CAC">CAC</option>
              <option value="CVS">CVS</option>
              <option value="UVA">UVA</option>
              <option value="IPC">IPC</option>
              <option value="USD_OFICIAL">USD Oficial</option>
            </select>
            <span className="text-sm text-slate-500 ml-auto">
              {loading ? "Cargando..." : indices.length + " valores"}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Cargando...</div>
          ) : indices.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              No hay valores cargados para el filtro seleccionado.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">Indice</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">Periodo</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">Ajusta</th>
                  <th className="text-right px-6 py-3 font-medium text-slate-600">Porcentaje</th>
                  <th className="text-right px-6 py-3 font-medium text-slate-600">Coeficiente</th>
                  <th className="text-right px-6 py-3 font-medium text-slate-600">V. acumulado</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">Fuente</th>
                  <th className="text-center px-6 py-3 font-medium text-slate-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {indicesOrdenados.map((item) => {
                  const esUltimo = ultimosPorIndice[item.indice] === item.periodo;
                  return (
                    <tr
                      key={item.id}
                      className={
                        "border-t border-slate-100 hover:bg-slate-50 transition " +
                        (esUltimo ? "bg-amber-50/40" : "")
                      }
                    >
                      <td className="px-6 py-3 font-medium text-slate-900">
                        <span className="inline-flex items-center gap-1.5">
                          {item.indice}
                          {esUltimo && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              ultimo
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-700">{formatPeriodo(item.periodo)}</td>
                      <td className="px-6 py-3 text-slate-500 text-xs">
                        {mesQueAjusta(item.periodo, item.indice)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-slate-700">
                        {formatPct(item.coeficiente)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-slate-700">
                        {parseFloat(item.coeficiente).toFixed(6)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-slate-500 text-xs">
                        {item.valor_acumulado ? parseFloat(item.valor_acumulado).toFixed(4) : "-"}
                      </td>
                      <td className="px-6 py-3 text-slate-700 text-xs">{item.fuente || "-"}</td>
                      <td className="px-6 py-3 text-center">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => abrirModalEditar(item)}
                            className="text-brand-600 hover:text-brand-700"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className="text-rose-600 hover:text-rose-700"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <ModalCargarIndice
          item={editingItem}
          onClose={cerrarModal}
          onSaved={() => {
            cerrarModal();
            cargar();
          }}
        />
      )}

      {deleteTarget && (
        <ModalEliminar
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            cargar();
          }}
        />
      )}
    </AppShell>
  );
}

// ============================================================================
// Modal de carga / edicion
// ============================================================================
function ModalCargarIndice({
  item,
  onClose,
  onSaved,
}: {
  item: IndiceValor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esEdicion = item !== null;

  const [indice, setIndice] = useState(item?.indice || "CAC");
  const [mesAnio, setMesAnio] = useState(item ? periodoToInputMonth(item.periodo) : "");
  const [porcentaje, setPorcentaje] = useState(
    item ? String(coefToPct(item.coeficiente)) : ""
  );
  const [fuente, setFuente] = useState(item?.fuente || "");
  const [fechaPublicacion, setFechaPublicacion] = useState(
    item?.fecha_publicacion ? item.fecha_publicacion.substring(0, 10) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!indice) { setError("Indice requerido"); setSubmitting(false); return; }
    if (!mesAnio || !/^\d{4}-\d{2}$/.test(mesAnio)) {
      setError("Periodo invalido (YYYY-MM)"); setSubmitting(false); return;
    }
    const pct = parseFloat(porcentaje);
    if (isNaN(pct)) { setError("Porcentaje invalido"); setSubmitting(false); return; }

    const periodo = mesAnio + "-01";

    try {
      const res = await fetch("/api/cuotas/indices/cargar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indice,
          periodo,
          porcentaje: pct,
          fuente: fuente || undefined,
          fecha_publicacion: fechaPublicacion || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Error al guardar");
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch (err: any) {
      setError("Error de red: " + err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-slate-900">
            {esEdicion ? "Editar valor de indice" : "Cargar nuevo valor"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" disabled={submitting}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Indice</label>
            <select
              value={indice}
              onChange={(e) => setIndice(e.target.value)}
              disabled={esEdicion}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="CAC">CAC</option>
              <option value="CVS">CVS</option>
              <option value="UVA">UVA</option>
              <option value="IPC">IPC</option>
              <option value="USD_OFICIAL">USD Oficial</option>
            </select>
            {esEdicion && (
              <p className="text-xs text-slate-500 mt-1">
                El indice no se puede cambiar al editar.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Periodo del indice</label>
            <input
              type="month"
              value={mesAnio}
              onChange={(e) => setMesAnio(e.target.value)}
              disabled={esEdicion}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
            />
            <p className="text-xs text-slate-500 mt-1">
              {indice === "CVS" && "CVS: ajusta 3 meses despues"}
              {indice === "CAC" && "CAC: ajusta 2 meses despues"}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Porcentaje mensual (%)
            </label>
            <input
              type="number"
              step="0.01"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              required
              placeholder="Ej: 2.0 (significa 2%)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {porcentaje && !isNaN(parseFloat(porcentaje)) && (
              <p className="text-xs text-slate-500 mt-1">
                Factor calculado: {(1 + parseFloat(porcentaje) / 100).toFixed(6)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fuente</label>
            <input
              type="text"
              value={fuente}
              onChange={(e) => setFuente(e.target.value)}
              placeholder="INDEC, CAMARCO, BCRA, manual, etc."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fecha de publicacion (opcional)
            </label>
            <input
              type="date"
              value={fechaPublicacion}
              onChange={(e) => setFechaPublicacion(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60"
            >
              {submitting ? "Guardando..." : (
                <>
                  <CheckCircle2 size={16} />
                  {esEdicion ? "Actualizar" : "Crear"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Modal de eliminacion
// ============================================================================
function ModalEliminar({
  item,
  onClose,
  onDeleted,
}: {
  item: IndiceValor;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corridasEnUso, setCorridasEnUso] = useState<any[]>([]);

  async function handleDelete() {
    setError(null);
    setCorridasEnUso([]);
    setSubmitting(true);

    try {
      const res = await fetch("/api/cuotas/indices/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indice: item.indice,
          periodo: item.periodo.substring(0, 10),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Error al eliminar");
        if (json.corridas_que_lo_usan) {
          setCorridasEnUso(json.corridas_que_lo_usan);
        }
        setSubmitting(false);
        return;
      }
      onDeleted();
    } catch (err: any) {
      setError("Error de red: " + err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
            <AlertTriangle className="text-rose-600" size={20} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Eliminar valor de indice</h2>
        </div>

        <p className="text-slate-600 mb-4">
          Vas a eliminar el valor de{" "}
          <strong className="text-slate-900">{item.indice}</strong> para{" "}
          <strong className="text-slate-900">{formatPeriodo(item.periodo)}</strong>{" "}
          ({formatPct(item.coeficiente)}).
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
          <strong>Atencion:</strong> los valores acumulados de los meses posteriores
          se recalcularan automaticamente.
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm mb-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium">{error}</div>
                {corridasEnUso.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {corridasEnUso.map((c, i) => (
                      <li key={i}>
                        - Tenant <strong>{c.tenant}</strong>: corrida del{" "}
                        {formatPeriodo(c.periodo_aplicacion)} ({c.cuotas_afectadas} cuotas)
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
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
            onClick={handleDelete}
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60"
          >
            {submitting ? "Eliminando..." : (
              <>
                <Trash2 size={16} />
                Eliminar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}