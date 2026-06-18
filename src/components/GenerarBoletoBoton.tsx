"use client";

import { useState } from "react";
import { FileText, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";

type Plantilla = {
  id: string;
  modalidad: string;
  con_anticipo: boolean;
  indice: string;
  nombre: string;
  archivo_nombre: string;
  sugerida: boolean;
};

type PlantillasResp = {
  ok: boolean;
  plantillas: Plantilla[];
  proyecto_id?: string;
  proyecto_nombre?: string;
  sugerencia?: { modalidad: string; con_anticipo: boolean; indice: string };
  aviso_indice?: string | null;
  error?: string;
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

function labelCombo(p: Plantilla): string {
  const k = `${p.modalidad}|${p.con_anticipo}|${p.indice}`;
  return COMBO_LABEL[k] || `${p.modalidad} ${p.con_anticipo ? "anticipo" : ""} ${p.indice}`.trim();
}

export function GenerarBoletoBoton({
  tenant,
  ventaId,
  estado,
}: {
  tenant: string;
  ventaId: string;
  estado: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [proyectoNombre, setProyectoNombre] = useState<string | null>(null);
  const [avisoIndice, setAvisoIndice] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const disabled = estado !== "CONTABILIZADA";

  async function abrir() {
    if (disabled) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/boletos/plantillas-disponibles?t=${tenant}&venta_id=${ventaId}`);
      const data: PlantillasResp = await res.json();
      if (!res.ok) { setError(data.error || "Error al cargar plantillas"); return; }
      setPlantillas(data.plantillas || []);
      setProyectoNombre(data.proyecto_nombre || null);
      setAvisoIndice(data.aviso_indice || null);
      const sugerida = data.plantillas.find((p: Plantilla) => p.sugerida);
      if (sugerida) setSeleccionada(sugerida.id);
      else if (data.plantillas.length > 0) setSeleccionada(data.plantillas[0].id);
    } catch (e: any) {
      setError(e.message || "Error de conexiÃ³n");
    } finally {
      setLoading(false);
    }
  }

  async function generar(formato: "docx" | "pdf" = "docx") {
    if (!seleccionada) return;
    setGenerando(true);
    setError(null);
    try {
      const res = await fetch("/api/boletos/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, venta_id: ventaId, plantilla_id: seleccionada, formato }),
      });
      if (!res.ok) {
        let data: any;
        try { data = await res.json(); } catch { data = {}; }
        setError((data.error || "Error al generar boleto") + (data.hint ? ` â€” ${data.hint}` : ""));
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `boleto_${ventaId.substring(0,8)}.${formato}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e: any) {
      setError(e.message || "Error de conexiÃ³n");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        disabled={disabled}
        title={disabled ? `El boleto se genera para ventas CONTABILIZADAS. Estado actual: ${estado}` : "Generar boleto"}
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg"
      >
        <FileText size={16} />
        Generar Boleto
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Generar Boleto</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl">Ã—</button>
            </div>

            <div className="p-5 overflow-y-auto">
              {loading ? (
                <div className="py-8 text-center text-slate-500">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                  Cargando plantillas...
                </div>
              ) : plantillas.length === 0 ? (
                <div className="py-6 text-center">
                  <AlertCircle size={32} className="mx-auto text-amber-500 mb-2" />
                  <p className="text-slate-700 font-medium mb-1">No hay plantillas para este proyecto.</p>
                  {proyectoNombre && (
                    <p className="text-sm text-slate-600 mb-3">
                      Proyecto: <strong>{proyectoNombre}</strong>
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mb-3">
                    TenÃ©s que subir las plantillas de boleto para este proyecto en el ABM.
                  </p>
                  <a
                    href={`/plantillas-boleto?t=${tenant}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
                  >
                    Ir a Plantillas Boleto
                  </a>
                </div>
              ) : (
                <>
                  {avisoIndice && (
                    <div className="mb-3 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900 inline-flex items-start gap-2">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
                      <span>{avisoIndice}</span>
                    </div>
                  )}
                  <p className="text-sm text-slate-600 mb-3">
                    {proyectoNombre && <>Proyecto: <strong>{proyectoNombre}</strong>. </>}
                    ElegÃ­ la plantilla a usar. La sugerida segÃºn los datos de la venta estÃ¡ marcada con <CheckCircle2 size={14} className="inline text-green-600" />.
                  </p>
                  <div className="space-y-2">
                    {plantillas.map(p => (
                      <label key={p.id} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                        seleccionada === p.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                      }`}>
                        <input
                          type="radio"
                          name="plantilla"
                          value={p.id}
                          checked={seleccionada === p.id}
                          onChange={() => setSeleccionada(p.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{labelCombo(p)}</span>
                            {p.sugerida && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                <CheckCircle2 size={12} /> Sugerida
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{p.nombre}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{p.archivo_nombre}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 flex justify-end gap-3 flex-wrap">
              <button onClick={() => setOpen(false)} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium">
                Cancelar
              </button>
              <button
                onClick={() => generar("docx")}
                disabled={generando || !seleccionada || plantillas.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 border border-brand-600 text-brand-700 hover:bg-brand-50 disabled:opacity-50 text-sm font-medium rounded-lg"
              >
                {generando ? <><Loader2 size={16} className="animate-spin" /> Generando...</> : <><FileText size={16} /> Descargar .docx</>}
              </button>
              <button
                onClick={() => generar("pdf")}
                disabled={generando || !seleccionada || plantillas.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {generando ? <><Loader2 size={16} className="animate-spin" /> Generando...</> : <><FileText size={16} /> Descargar .pdf</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
