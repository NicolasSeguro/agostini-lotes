"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Save, XCircle, AlertTriangle } from "lucide-react";

const MapaCentroProyecto = dynamic(() => import("@/components/MapaCentroProyecto").then(m => m.MapaCentroProyecto), {
  ssr: false,
  loading: () => <div className="h-[380px] bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-sm">Cargando mapa...</div>,
});

const ESTADOS = [
  { v: "EN_OBRA", l: "En obra" },
  { v: "TERMINADO", l: "Terminado (infraestructura)" },
  { v: "APROBADO", l: "Aprobado (para escriturar)" },
];

const TIPOS = ["URBANIZACION", "BARRIO_CERRADO", "LOTEO", "HISTORICO", "OTRO"];

export function ProyectoForm({
  tenant,
  proyecto,
  modo,
}: {
  tenant: string;
  proyecto?: any;
  modo: "nuevo" | "editar";
}) {
  const router = useRouter();
  const editando = modo === "editar";

  const [codigo, setCodigo] = useState(proyecto?.codigo || "");
  const [nombre, setNombre] = useState(proyecto?.nombre || "");
  const [tipoProyecto, setTipoProyecto] = useState(proyecto?.tipo_proyecto || "URBANIZACION");
  const [estado, setEstado] = useState(proyecto?.estado || "EN_OBRA");
  const [direccion, setDireccion] = useState(proyecto?.direccion || "");
  const [localidad, setLocalidad] = useState(proyecto?.localidad || "");
  const [provincia, setProvincia] = useState(proyecto?.provincia || "Jujuy");
  const [centroLat, setCentroLat] = useState<number | null>(
    proyecto?.centro_lat ? Number(proyecto.centro_lat) : null
  );
  const [centroLng, setCentroLng] = useState<number | null>(
    proyecto?.centro_lng ? Number(proyecto.centro_lng) : null
  );
  const [kmzUrl, setKmzUrl] = useState(proyecto?.kmz_url || "");
  const [fechaLanzamiento, setFechaLanzamiento] = useState(proyecto?.fecha_lanzamiento || "");
  // tope_desc_financiero viene en BD como decimal (0.10), lo paso a % (10)
  const initialTope = proyecto?.config?.tope_desc_financiero_pct;
  const [topeDescFin, setTopeDescFin] = useState<number | "">(
    initialTope !== null && initialTope !== undefined ? Number(initialTope) * 100 : 10
  );
  const [activo, setActivo] = useState(proyecto?.activo !== false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!codigo.trim()) { setError("Código obligatorio"); return; }
    if (!nombre.trim()) { setError("Nombre obligatorio"); return; }

    setSubmitting(true);
    try {
      const payload: any = {
        tenant,
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        tipo_proyecto: tipoProyecto || null,
        estado,
        direccion: direccion.trim() || null,
        localidad: localidad.trim() || null,
        provincia: provincia.trim() || null,
        centro_lat: centroLat,
        centro_lng: centroLng,
        kmz_url: kmzUrl.trim() || null,
        fecha_lanzamiento: fechaLanzamiento || null,
        tope_desc_financiero_pct: topeDescFin === "" ? null : topeDescFin,
        activo,
      };
      const url = editando ? `/api/proyectos/${proyecto.id}` : `/api/proyectos/crear`;
      const method = editando ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al guardar"); setSubmitting(false); return; }
      router.push(`/proyectos?t=${tenant}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error de conexión");
      setSubmitting(false);
    }
  }

  function onCentroChange(lat: number | null, lng: number | null) {
    setCentroLat(lat);
    setCentroLng(lng);
  }

  const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "text-xs text-slate-600 mb-1 block";

  return (
    <div className="space-y-6">
      <Link href={`/proyectos?t=${tenant}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft size={16} /> Volver al listado
      </Link>

      <h1 className="text-3xl font-bold text-slate-900">{editando ? "Editar Proyecto" : "Nuevo Proyecto"}</h1>

      {/* Identificación */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Identificación</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Código *</label>
            <input className={inputCls} value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ej: JAC-01" />
          </div>
          <div>
            <label className={labelCls}>Nombre *</label>
            <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Tipo de proyecto</label>
            <select className={inputCls + " bg-white"} value={tipoProyecto} onChange={e => setTipoProyecto(e.target.value)}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Estado *</label>
            <select className={inputCls + " bg-white"} value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Fecha de lanzamiento</label>
            <input type="date" className={inputCls} value={fechaLanzamiento} onChange={e => setFechaLanzamiento(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>KMZ URL (opcional)</label>
            <input className={inputCls} value={kmzUrl} onChange={e => setKmzUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
      </section>

      {/* Ubicación */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Ubicación</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="md:col-span-3"><label className={labelCls}>Dirección</label><input className={inputCls} value={direccion} onChange={e => setDireccion(e.target.value)} /></div>
          <div><label className={labelCls}>Localidad</label><input className={inputCls} value={localidad} onChange={e => setLocalidad(e.target.value)} /></div>
          <div><label className={labelCls}>Provincia</label><input className={inputCls} value={provincia} onChange={e => setProvincia(e.target.value)} /></div>
        </div>
        <h3 className="text-sm font-medium text-slate-700 mb-2">Centro del proyecto en el mapa</h3>
        <MapaCentroProyecto initialLat={centroLat} initialLng={centroLng} onChange={onCentroChange} />
      </section>

      {/* Configuración */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Configuración</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Tope desc. financiero (%)</label>
            <input
              type="number" step="0.01" min="0" max="100"
              className={inputCls}
              value={topeDescFin === "" ? "" : topeDescFin}
              onChange={e => setTopeDescFin(e.target.value ? parseFloat(e.target.value) : "")}
              placeholder="10.00"
            />
            <p className="text-xs text-slate-400 mt-1">Por encima de este valor, el descuento financiero requiere autorización.</p>
          </div>
        </div>
      </section>

      {/* Estado activo */}
      {editando && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
            <span className="text-sm">Activo (disponible para nuevas ventas)</span>
          </label>
          {!activo && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2 inline-flex items-start gap-1">
              <AlertTriangle size={12} className="mt-0.5" />
              <span>Proyecto inactivo: no aparecerá al cargar nuevas ventas. Las existentes no se afectan.</span>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 inline-flex items-start gap-2">
          <XCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link href={`/proyectos?t=${tenant}`} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium">Cancelar</Link>
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="inline-flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
          <Save size={16} /> {submitting ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
