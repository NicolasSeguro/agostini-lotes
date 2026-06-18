"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2, XCircle, AlertTriangle, FileSpreadsheet, Loader2 } from "lucide-react";

type Cambio = {
  id: string;
  proyecto: string | null;
  manzana: string | null;
  numero: string;
  estado_actual: string;
  cambios: { campo: string; valor_viejo: any; valor_nuevo: any }[];
};

type Omitido = {
  fila: number;
  id: string | null;
  motivo: string;
  detalle?: string;
};

type PreviewResp = {
  ok: boolean;
  total_filas: number;
  cambios: Cambio[];
  omitidos: Omitido[];
  errores: { fila: number; mensaje: string }[];
  resumen: { con_cambios: number; omitidos: number; errores: number; sin_cambios: number };
};

function formatVal(v: any): string {
  if (v === null || v === undefined || v === "") return "â€”";
  if (typeof v === "boolean") return v ? "SI" : "NO";
  if (typeof v === "number") {
    if (Math.abs(v) >= 1000) return v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
    return String(v);
  }
  return String(v);
}

const LABEL_CAMPO: Record<string, string> = {
  superficie_m2: "Superficie (mÂ²)",
  frente_ml: "Frente (ml)",
  fondo_ml: "Fondo (ml)",
  zona: "Zona",
  precio_lista: "Precio lista",
  coeficiente: "Coeficiente",
  moneda: "Moneda",
  matricula: "MatrÃ­cula",
  tiene_agua: "Agua",
  tiene_luz: "Luz",
  tiene_cloacas: "Cloacas",
  tiene_gas: "Gas",
};

export function ImportLotesCliente({ tenant }: { tenant: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<{ aplicados: number; omitidos: number } | null>(null);

  async function handlePreview() {
    if (!file) { setError("SeleccionÃ¡ un archivo"); return; }
    setError(null);
    setPreview(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("tenant", tenant);
      fd.append("file", file);
      const res = await fetch("/api/lotes/importar/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al procesar el archivo");
        return;
      }
      setPreview(data);
    } catch (e: any) {
      setError(e.message || "Error de conexiÃ³n");
    } finally {
      setLoading(false);
    }
  }

  async function handleAplicar() {
    if (!preview || preview.cambios.length === 0) return;
    if (!confirm(`Se van a actualizar ${preview.cambios.length} lote(s). Â¿ConfirmÃ¡s?`)) return;
    setAplicando(true);
    setError(null);
    try {
      const payload = {
        tenant,
        cambios: preview.cambios.map(c => ({
          id: c.id,
          cambios: c.cambios.map(cc => ({ campo: cc.campo, valor_nuevo: cc.valor_nuevo })),
        })),
      };
      const res = await fetch("/api/lotes/importar/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al aplicar"); return; }
      setResultado({ aplicados: data.aplicados, omitidos: data.omitidos });
      setPreview(null);
      setFile(null);
    } catch (e: any) {
      setError(e.message || "Error de conexiÃ³n");
    } finally {
      setAplicando(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    setResultado(null);
  }

  // Resultado final
  if (resultado) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <CheckCircle2 className="mx-auto text-green-600 mb-3" size={48} />
        <h2 className="text-xl font-semibold text-slate-900 mb-2">ImportaciÃ³n completada</h2>
        <p className="text-slate-600 mb-4">
          Se actualizaron <b>{resultado.aplicados}</b> lote{resultado.aplicados === 1 ? "" : "s"}.
          {resultado.omitidos > 0 && <span> Omitidos: {resultado.omitidos}.</span>}
        </p>
        <div className="flex justify-center gap-3">
          <button onClick={reset} className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-sm">Importar otro</button>
          <button onClick={() => router.push(`/lotes?t=${tenant}`)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium">Volver al listado</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Paso 1: subir archivo */}
      {!preview && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-2">1. SeleccionÃ¡ el archivo Excel</h2>
          <p className="text-xs text-slate-500 mb-4">
            UsÃ¡ el archivo descargado con "Exportar Excel", editÃ¡ los precios u otros campos en tu PC,
            y subilo acÃ¡. Vas a ver un preview antes de aplicar nada.
          </p>

          <label className="flex items-center gap-3 border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-slate-50 rounded-lg p-6 cursor-pointer transition">
            <FileSpreadsheet className="text-slate-400" size={32} />
            <div className="flex-1">
              <div className="text-sm text-slate-700 font-medium">
                {file ? file.name : "HacÃ© click para seleccionar archivo .xlsx"}
              </div>
              {file && <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</div>}
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); }}
              className="hidden"
            />
          </label>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 inline-flex items-start gap-2">
              <XCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={handlePreview}
              disabled={!file || loading}
              className="inline-flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Procesando...</> : <><Upload size={16} /> Ver preview</>}
            </button>
          </div>
        </div>
      )}

      {/* Paso 2: preview */}
      {preview && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-3">2. Preview de cambios</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-slate-50 rounded p-3">
                <div className="text-xs text-slate-500">Filas en el Excel</div>
                <div className="font-semibold text-slate-900 text-lg">{preview.total_filas}</div>
              </div>
              <div className="bg-green-50 rounded p-3">
                <div className="text-xs text-green-700">Con cambios</div>
                <div className="font-semibold text-green-700 text-lg">{preview.resumen.con_cambios}</div>
              </div>
              <div className="bg-slate-50 rounded p-3">
                <div className="text-xs text-slate-500">Sin cambios</div>
                <div className="font-semibold text-slate-700 text-lg">{preview.resumen.sin_cambios}</div>
              </div>
              <div className="bg-amber-50 rounded p-3">
                <div className="text-xs text-amber-700">Omitidos / errores</div>
                <div className="font-semibold text-amber-700 text-lg">{preview.resumen.omitidos + preview.resumen.errores}</div>
              </div>
            </div>
          </div>

          {/* Errores */}
          {preview.errores.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <h3 className="font-semibold text-red-900 mb-2 inline-flex items-center gap-2">
                <XCircle size={18} /> Errores de formato ({preview.errores.length})
              </h3>
              <ul className="text-sm text-red-700 space-y-1">
                {preview.errores.slice(0, 50).map((e, i) => (
                  <li key={i}>Fila {e.fila}: {e.mensaje}</li>
                ))}
                {preview.errores.length > 50 && <li className="text-xs">... y {preview.errores.length - 50} mÃ¡s</li>}
              </ul>
            </div>
          )}

          {/* Omitidos */}
          {preview.omitidos.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="font-semibold text-amber-900 mb-2 inline-flex items-center gap-2">
                <AlertTriangle size={18} /> Lotes omitidos ({preview.omitidos.length})
              </h3>
              <p className="text-xs text-amber-700 mb-2">
                Solo se actualizan lotes en estado DISPONIBLE. Estos no se van a modificar:
              </p>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.omitidos.slice(0, 100).map((o, i) => (
                      <tr key={i} className="border-b border-amber-100">
                        <td className="py-1 pr-2 text-amber-800">Fila {o.fila}</td>
                        <td className="py-1 pr-2 text-amber-700">{o.detalle || o.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.omitidos.length > 100 && (
                  <p className="text-xs text-amber-600 mt-2">... y {preview.omitidos.length - 100} mÃ¡s</p>
                )}
              </div>
            </div>
          )}

          {/* Cambios */}
          {preview.cambios.length > 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h3 className="font-semibold text-green-700 inline-flex items-center gap-2">
                  <CheckCircle2 size={18} /> Cambios a aplicar ({preview.cambios.length})
                </h3>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-slate-500 font-medium uppercase">Lote</th>
                      <th className="px-3 py-2 text-left text-xs text-slate-500 font-medium uppercase">Campo</th>
                      <th className="px-3 py-2 text-left text-xs text-slate-500 font-medium uppercase">Valor actual</th>
                      <th className="px-3 py-2 text-left text-xs text-slate-500 font-medium uppercase">Valor nuevo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.cambios.map((c) => (
                      c.cambios.map((cc, idx) => (
                        <tr key={`${c.id}-${cc.campo}`} className="border-b border-slate-100 hover:bg-slate-50">
                          {idx === 0 && (
                            <td className="px-3 py-2 font-medium text-slate-900" rowSpan={c.cambios.length}>
                              {c.manzana ? `M${c.manzana}-L${c.numero}` : `L${c.numero}`}
                              {c.proyecto && <div className="text-xs text-slate-500 font-normal">{c.proyecto}</div>}
                            </td>
                          )}
                          <td className="px-3 py-2 text-slate-700">{LABEL_CAMPO[cc.campo] || cc.campo}</td>
                          <td className="px-3 py-2 text-slate-500 line-through">{formatVal(cc.valor_viejo)}</td>
                          <td className="px-3 py-2 text-green-700 font-medium">{formatVal(cc.valor_nuevo)}</td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-slate-600">
              No hay cambios para aplicar. Todos los lotes estÃ¡n iguales que en la base.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 inline-flex items-start gap-2">
              <XCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={reset} className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium">
              Cancelar
            </button>
            <button
              onClick={handleAplicar}
              disabled={aplicando || preview.cambios.length === 0}
              className="inline-flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
            >
              {aplicando ? <><Loader2 size={16} className="animate-spin" /> Aplicando...</> : <><CheckCircle2 size={16} /> Confirmar e importar</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
