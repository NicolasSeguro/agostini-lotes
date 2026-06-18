"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Download, CheckCircle2, XCircle, Loader2, FileText } from "lucide-react";

type Plantilla = {
  id: string;
  proyecto_id: string;
  proyecto_nombre: string;
  modalidad: string;
  con_anticipo: boolean;
  indice: string;
  nombre: string;
  descripcion: string | null;
  archivo_nombre: string;
  archivo_size: number;
  updated_at: string;
};

type Combinacion = {
  modalidad: string;
  con_anticipo: boolean;
  indice: string;
  label: string;
};

// Lo que tiene sentido tener configurado por proyecto
const COMBINACIONES: Combinacion[] = [
  { modalidad: "CONTADO", con_anticipo: false, indice: "NINGUNO", label: "Contado" },
  { modalidad: "CUOTAS",  con_anticipo: true,  indice: "FIJO",    label: "Anticipo + Cuotas (sin ajuste)" },
  { modalidad: "CUOTAS",  con_anticipo: true,  indice: "CAC",     label: "Anticipo + Cuotas (CAC)" },
  { modalidad: "CUOTAS",  con_anticipo: true,  indice: "CVS",     label: "Anticipo + Cuotas (CVS)" },
  { modalidad: "CUOTAS",  con_anticipo: false, indice: "FIJO",    label: "Cuotas sin anticipo (sin ajuste)" },
  { modalidad: "CUOTAS",  con_anticipo: false, indice: "CAC",     label: "Cuotas sin anticipo (CAC)" },
  { modalidad: "CUOTAS",  con_anticipo: false, indice: "CVS",     label: "Cuotas sin anticipo (CVS)" },
  { modalidad: "FINANCIADO", con_anticipo: false, indice: "CAC",  label: "100% Financiado (CAC)" },
  { modalidad: "FINANCIADO", con_anticipo: false, indice: "CVS",  label: "100% Financiado (CVS)" },
];

type Proyecto = { id: string; nombre: string };

export function PlantillasBoletoCliente({
  tenant,
  proyectos,
  plantillas,
}: {
  tenant: string;
  proyectos: Proyecto[];
  plantillas: Plantilla[];
}) {
  const router = useRouter();
  const [proyectoId, setProyectoId] = useState<string>(proyectos[0]?.id || "");
  const [comboIdx, setComboIdx] = useState(0);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const plantillasDelProyecto = plantillas.filter(p => p.proyecto_id === proyectoId);

  function key(modalidad: string, conAnticipo: boolean, indice: string) {
    return `${modalidad}|${conAnticipo}|${indice}`;
  }

  function existePlantilla(c: Combinacion): Plantilla | undefined {
    return plantillasDelProyecto.find(p =>
      key(p.modalidad, p.con_anticipo, p.indice) === key(c.modalidad, c.con_anticipo, c.indice)
    );
  }

  async function subir() {
    setError(null); setResultado(null);
    if (!proyectoId) { setError("SeleccionÃ¡ un proyecto"); return; }
    if (!file) { setError("SeleccionÃ¡ un archivo .docx"); return; }
    if (!nombre.trim()) { setError("Nombre obligatorio"); return; }

    setSubmitting(true);
    try {
      const combo = COMBINACIONES[comboIdx];
      const fd = new FormData();
      fd.append("tenant", tenant);
      fd.append("proyecto_id", proyectoId);
      fd.append("modalidad", combo.modalidad);
      fd.append("con_anticipo", String(combo.con_anticipo));
      fd.append("indice", combo.indice);
      fd.append("nombre", nombre.trim());
      fd.append("descripcion", descripcion.trim());
      fd.append("archivo", file);

      const res = await fetch("/api/plantillas-boleto/crear", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al subir"); return; }
      setResultado(data.reemplazada ? "Plantilla reemplazada correctamente" : "Plantilla creada correctamente");
      setFile(null);
      setNombre("");
      setDescripcion("");
      router.refresh();
    } catch (e: any) {
      setError(e.message || "Error de conexiÃ³n");
    } finally {
      setSubmitting(false);
    }
  }

  async function eliminar(id: string, nombrePlantilla: string) {
    if (!confirm(`Â¿Eliminar la plantilla "${nombrePlantilla}"?`)) return;
    try {
      const res = await fetch(`/api/plantillas-boleto/${id}?t=${tenant}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Error"); return; }
      router.refresh();
    } catch (e: any) {
      alert(e.message || "Error");
    }
  }

  const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "text-xs text-slate-600 mb-1 block";

  return (
    <div className="space-y-6">
      {/* Selector de proyecto */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <label className={labelCls}>Proyecto</label>
        <select
          value={proyectoId}
          onChange={(e) => setProyectoId(e.target.value)}
          className={inputCls + " bg-white max-w-md"}
        >
          {proyectos.length === 0 && <option value="">No hay proyectos cargados</option>}
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      {/* Estado actual por combinaciÃ³n */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Plantillas configuradas para este proyecto</h2>
          <p className="text-xs text-slate-500 mt-1">
            Cada combinaciÃ³n de modalidad / Ã­ndice tiene una plantilla. SubÃ­ o reemplazÃ¡ cada una.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium uppercase">CombinaciÃ³n</th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium uppercase">Estado</th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium uppercase">Archivo</th>
                <th className="px-4 py-2 text-right text-xs text-slate-500 font-medium uppercase">AcciÃ³n</th>
              </tr>
            </thead>
            <tbody>
              {COMBINACIONES.map((c) => {
                const p = existePlantilla(c);
                return (
                  <tr key={c.label} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-700">{c.label}</td>
                    <td className="px-4 py-2">
                      {p ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                          <CheckCircle2 size={12} /> Cargada
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500">Falta</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600 text-xs">
                      {p ? `${p.archivo_nombre} (${(p.archivo_size / 1024).toFixed(1)} KB)` : "â€”"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p && (
                        <div className="inline-flex gap-1">
                          <a
                            href={`/api/plantillas-boleto/${p.id}/descargar?t=${tenant}`}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                            title="Descargar"
                          >
                            <Download size={14} />
                          </a>
                          <button
                            onClick={() => eliminar(p.id, p.nombre)}
                            className="p-1.5 hover:bg-red-50 rounded text-red-700"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulario de subida */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Subir / reemplazar plantilla</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>CombinaciÃ³n *</label>
            <select className={inputCls + " bg-white"} value={comboIdx} onChange={e => setComboIdx(parseInt(e.target.value))}>
              {COMBINACIONES.map((c, i) => (
                <option key={c.label} value={i}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Nombre interno *</label>
            <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Boleto Contado Nogal" />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>DescripciÃ³n (opcional)</label>
            <input className={inputCls} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-3 border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-slate-50 rounded-lg p-4 cursor-pointer transition">
              <FileText className="text-slate-400" size={28} />
              <div className="flex-1">
                <div className="text-sm text-slate-700 font-medium">
                  {file ? file.name : "Click para seleccionar archivo .docx"}
                </div>
                {file && <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</div>}
              </div>
              <input
                type="file"
                accept=".docx"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); }}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 inline-flex items-start gap-2">
            <XCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}
        {resultado && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded p-3 text-sm text-green-700 inline-flex items-start gap-2">
            <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> <span>{resultado}</span>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={subir}
            disabled={submitting || !file || !proyectoId}
            className="inline-flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
          >
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Subiendo...</> : <><Upload size={16} /> Subir plantilla</>}
          </button>
        </div>
      </div>
    </div>
  );
}
