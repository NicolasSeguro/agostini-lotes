"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  FileSignature, FileText, Search, CheckCircle2, AlertCircle, 
  Loader2, X, Calendar, RefreshCw 
} from "lucide-react";

type Boleto = {
  id: string;
  nro: number;
  precio_total: string;
  anticipo: string;
  cant_cuotas: number;
  sistema_amort: string;
  indice_ajuste: string;
  fecha: string;
  lote_id: string;
  lote_numero: string;
  lote_manzana: string | null;
  proyecto_id: string;
  proyecto_nombre: string;
  titular_principal: string | null;
  titulares_count: number;
  emisiones_count: number;
  ultima_emision: string | null;
};

type Proyecto = { id: string; nombre: string };

type Plantilla = {
  id: string;
  modalidad: string;
  con_anticipo: boolean;
  indice: string;
  nombre: string;
  archivo_nombre: string;
  sugerida: boolean;
};

const COMBO_LABEL: Record<string, string> = {
  "CONTADO|false|NINGUNO": "Contado",
  "CUOTAS|true|FIJO": "Anticipo + Cuotas (sin ajuste)",
  "CUOTAS|true|CAC": "Anticipo + Cuotas (CAC)",
  "CUOTAS|true|CVS": "Anticipo + Cuotas (CVS)",
  "CUOTAS|false|FIJO": "Cuotas sin anticipo (sin ajuste)",
  "CUOTAS|false|CAC": "Cuotas sin anticipo (CAC)",
  "CUOTAS|false|CVS": "Cuotas sin anticipo (CVS)",
  "FINANCIADO|false|CAC": "100% Financiado (CAC)",
  "FINANCIADO|false|CVS": "100% Financiado (CVS)",
};

function labelPlantilla(p: Plantilla): string {
  return COMBO_LABEL[`${p.modalidad}|${p.con_anticipo}|${p.indice}`] || p.modalidad;
}

function labelModalidadVenta(b: Boleto): string {
  const cant = b.cant_cuotas;
  const anticipo = Number(b.anticipo) || 0;
  const ajust = b.sistema_amort === "AJUSTABLE";
  const idx = b.indice_ajuste !== "NINGUNO" ? b.indice_ajuste : "";
  if (cant === 0) return "Contado";
  if (anticipo === 0) {
    if (ajust) return `100% Financiado${idx ? ` (${idx})` : ""}`;
    return "Cuotas sin anticipo";
  }
  return `Anticipo + Cuotas${idx ? ` (${idx})` : ajust ? "" : " (sin ajuste)"}`;
}

function formatMoney(v: string | number): string {
  return Number(v).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatFecha(s: string): string {
  if (!s) return "â€”";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function formatFechaHora(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export function BoletosCliente({
  tenant,
  proyectos,
}: {
  tenant: string;
  proyectos: Proyecto[];
}) {
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [emitido, setEmitido] = useState<"" | "si" | "no">("");
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal estado
  const [modalVenta, setModalVenta] = useState<Boleto | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalPlantillas, setModalPlantillas] = useState<Plantilla[]>([]);
  const [modalProyNombre, setModalProyNombre] = useState<string | null>(null);
  const [modalAviso, setModalAviso] = useState<string | null>(null);
  const [modalSelec, setModalSelec] = useState("");
  const [modalGenerando, setModalGenerando] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  async function buscar() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ t: tenant });
      if (q.trim()) params.set("q", q.trim());
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (proyectoId) params.set("proyecto_id", proyectoId);
      if (emitido) params.set("emitido", emitido);
      const res = await fetch(`/api/boletos/listado?${params}`);
      // Intentar leer el body como JSON, pero si falla, mostrar el texto crudo
      let data: any;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(`El servidor devolviÃ³ respuesta no-JSON (status ${res.status}). RevisÃ¡ la consola del servidor (npm run dev). Body: ${text.slice(0, 200)}`);
        return;
      }
      if (!res.ok) { 
        setError(data.error || data.detail || `Error ${res.status}`); 
        return; 
      }
      setBoletos(data.boletos || []);
    } catch (e: any) {
      setError(e.message || "Error de conexiÃ³n");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { buscar(); /* eslint-disable-next-line */ }, []);

  function limpiarFiltros() {
    setQ(""); setDesde(""); setHasta(""); setProyectoId(""); setEmitido("");
    setTimeout(buscar, 50);
  }

  async function abrirModal(b: Boleto) {
    setModalVenta(b);
    setModalLoading(true);
    setModalError(null);
    setModalPlantillas([]);
    setModalSelec("");
    try {
      const res = await fetch(`/api/boletos/plantillas-disponibles?t=${tenant}&venta_id=${b.id}`);
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Error"); return; }
      setModalPlantillas(data.plantillas || []);
      setModalProyNombre(data.proyecto_nombre || null);
      setModalAviso(data.aviso_indice || null);
      const sug = data.plantillas?.find((p: Plantilla) => p.sugerida);
      if (sug) setModalSelec(sug.id);
      else if (data.plantillas?.length > 0) setModalSelec(data.plantillas[0].id);
    } catch (e: any) {
      setModalError(e.message || "Error de conexiÃ³n");
    } finally {
      setModalLoading(false);
    }
  }

  async function generar(formato: "docx" | "pdf" = "docx") {
    if (!modalVenta || !modalSelec) return;
    setModalGenerando(true);
    setModalError(null);
    try {
      const res = await fetch("/api/boletos/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, venta_id: modalVenta.id, plantilla_id: modalSelec, formato }),
      });
      if (!res.ok) {
        let d: any;
        try { d = await res.json(); } catch { d = {}; }
        setModalError((d.error || "Error al generar") + (d.hint ? ` â€” ${d.hint}` : ""));
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : `boleto_${modalVenta.id.substring(0,8)}.${formato}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      // Cerrar modal y refrescar listado para que se actualice estado emitido
      setModalVenta(null);
      buscar();
    } catch (e: any) {
      setModalError(e.message || "Error de conexiÃ³n");
    } finally {
      setModalGenerando(false);
    }
  }

  const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600 mb-1 block">Buscar comprador</label>
            <div className="relative">
              <Search size={16} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") buscar(); }}
                placeholder="Nombre, CUIT o DNI..."
                className={inputCls + " pl-9"}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Proyecto</label>
            <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} className={inputCls + " bg-white"}>
              <option value="">Todos</option>
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Estado boleto</label>
            <select value={emitido} onChange={e => setEmitido(e.target.value as any)} className={inputCls + " bg-white"}>
              <option value="">Todos</option>
              <option value="no">Sin emitir</option>
              <option value="si">Emitido</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={limpiarFiltros} className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm rounded-lg">
            Limpiar
          </button>
          <button
            onClick={buscar}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {loading ? "Cargando..." : `${boletos.length} venta${boletos.length === 1 ? "" : "s"} CONTABILIZADA${boletos.length === 1 ? "" : "S"}`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nro</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Proyecto - Lote</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Comprador</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Modalidad</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Precio</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Boleto</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">AcciÃ³n</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {boletos.map(b => (
                <tr key={b.id} className="hover:bg-slate-50 transition">
                  <td className="px-3 py-2">
                    <Link href={`/ventas/${b.id}?t=${tenant}`} className="text-brand-700 hover:underline font-mono">
                      {b.nro}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{formatFecha(b.fecha)}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {b.proyecto_nombre} â€” {b.lote_manzana ? `M${b.lote_manzana}-` : ""}L{b.lote_numero}
                  </td>
                  <td className="px-3 py-2 text-slate-900 font-medium">
                    {b.titular_principal || <span className="text-slate-400">â€”</span>}
                    {b.titulares_count > 1 && (
                      <span className="ml-1 text-xs text-slate-500">+{b.titulares_count - 1}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{labelModalidadVenta(b)}</td>
                  <td className="px-3 py-2 text-right text-slate-900 font-mono">${formatMoney(b.precio_total)}</td>
                  <td className="px-3 py-2 text-center">
                    {b.emisiones_count > 0 ? (
                      <span
                        title={b.ultima_emision ? `Ãšltima: ${formatFechaHora(b.ultima_emision)}${b.emisiones_count > 1 ? ` (${b.emisiones_count} emisiones)` : ""}` : ""}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700"
                      >
                        <CheckCircle2 size={12} /> Emitido
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500">
                        Sin emitir
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => abrirModal(b)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 hover:bg-brand-50 hover:border-brand-300 text-slate-700 text-xs font-medium rounded"
                    >
                      {b.emisiones_count > 0 ? <><RefreshCw size={12} /> Regenerar</> : <><FileText size={12} /> Generar</>}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && boletos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No hay ventas CONTABILIZADAS con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de generaciÃ³n */}
      {modalVenta && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {modalVenta.emisiones_count > 0 ? "Regenerar Boleto" : "Generar Boleto"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Venta #{modalVenta.nro} â€” {modalVenta.titular_principal}
                </p>
              </div>
              <button onClick={() => setModalVenta(null)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {modalLoading ? (
                <div className="py-8 text-center text-slate-500">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                  Cargando plantillas...
                </div>
              ) : modalPlantillas.length === 0 ? (
                <div className="py-6 text-center">
                  <AlertCircle size={32} className="mx-auto text-amber-500 mb-2" />
                  <p className="text-slate-700 font-medium mb-1">No hay plantillas para este proyecto.</p>
                  {modalProyNombre && (
                    <p className="text-sm text-slate-600 mb-3">Proyecto: <strong>{modalProyNombre}</strong></p>
                  )}
                  <a
                    href={`/plantillas-boleto?t=${tenant}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
                  >
                    Ir a Plantillas Boleto
                  </a>
                </div>
              ) : (
                <>
                  {modalAviso && (
                    <div className="mb-3 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900 flex items-start gap-2">
                      <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
                      <span>{modalAviso}</span>
                    </div>
                  )}
                  <p className="text-sm text-slate-600 mb-3">
                    {modalProyNombre && <>Proyecto: <strong>{modalProyNombre}</strong>. </>}
                    La sugerida segÃºn los datos de la venta estÃ¡ marcada con <CheckCircle2 size={14} className="inline text-green-600" />.
                  </p>
                  <div className="space-y-2">
                    {modalPlantillas.map(p => (
                      <label key={p.id} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                        modalSelec === p.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                      }`}>
                        <input
                          type="radio"
                          name="plantilla"
                          value={p.id}
                          checked={modalSelec === p.id}
                          onChange={() => setModalSelec(p.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{labelPlantilla(p)}</span>
                            {p.sugerida && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                <CheckCircle2 size={12} /> Sugerida
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{p.nombre}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {modalError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{modalError}</div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 flex justify-end gap-3 flex-wrap">
              <button onClick={() => setModalVenta(null)} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium">
                Cancelar
              </button>
              <button
                onClick={() => generar("docx")}
                disabled={modalGenerando || !modalSelec || modalPlantillas.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 border border-brand-600 text-brand-700 hover:bg-brand-50 disabled:opacity-50 text-sm font-medium rounded-lg"
              >
                {modalGenerando ? <><Loader2 size={16} className="animate-spin" /> Generando...</> : <><FileText size={16} /> Descargar .docx</>}
              </button>
              <button
                onClick={() => generar("pdf")}
                disabled={modalGenerando || !modalSelec || modalPlantillas.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {modalGenerando ? <><Loader2 size={16} className="animate-spin" /> Generando...</> : <><FileText size={16} /> Descargar .pdf</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
