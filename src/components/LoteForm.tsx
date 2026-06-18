"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Save, XCircle } from "lucide-react";
import { MoneyInput } from "@/components/MoneyInput";

// El mapa se carga solo en cliente (Leaflet usa window)
const MapaLote = dynamic(() => import("@/components/MapaLote").then(m => m.MapaLote), {
  ssr: false,
  loading: () => <div className="h-[420px] bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-sm">Cargando mapa...</div>,
});

const ESTADOS = ["DISPONIBLE", "RESERVADO", "VENDIDO", "ESCRITURADO", "BLOQUEADO", "RESCINDIDO"];

type Proyecto = { id: string; nombre: string; codigo?: string; centro_lat?: number | null; centro_lng?: number | null };

export function LoteForm({
  tenant,
  proyectos,
  lote,
  modo,
}: {
  tenant: string;
  proyectos: Proyecto[];
  lote?: any;
  modo: "nuevo" | "editar";
}) {
  const router = useRouter();
  const editando = modo === "editar";

  const [proyectoId, setProyectoId] = useState(lote?.proyecto_id || proyectos[0]?.id || "");
  const [numero, setNumero] = useState(lote?.numero || "");
  const [manzana, setManzana] = useState(lote?.manzana || "");
  const [numeroPadron, setNumeroPadron] = useState(lote?.numero_padron || "");
  const [superficie, setSuperficie] = useState<number | "">(lote?.superficie_m2 ? parseFloat(lote.superficie_m2) : "");
  const [frente, setFrente] = useState<number | "">(lote?.frente_ml ? parseFloat(lote.frente_ml) : "");
  const [fondo, setFondo] = useState<number | "">(lote?.fondo_ml ? parseFloat(lote.fondo_ml) : "");
  const [zona, setZona] = useState(lote?.zona || "");
  const [precioLista, setPrecioLista] = useState<number | "">(lote?.precio_lista ? parseFloat(lote.precio_lista) : "");
  const [coeficiente, setCoeficiente] = useState<number | "">(lote?.coeficiente ? parseFloat(lote.coeficiente) : "");
  const [moneda, setMoneda] = useState(lote?.moneda || "ARS");
  const [estado, setEstado] = useState(lote?.estado || "DISPONIBLE");
  const [matricula, setMatricula] = useState(lote?.matricula || "");
  const [tieneAgua, setTieneAgua] = useState<boolean>(lote?.tiene_agua || false);
  const [tieneLuz, setTieneLuz] = useState<boolean>(lote?.tiene_luz || false);
  const [tieneCloacas, setTieneCloacas] = useState<boolean>(lote?.tiene_cloacas || false);
  const [tieneGas, setTieneGas] = useState<boolean>(lote?.tiene_gas || false);
  const [geom, setGeom] = useState<any>(lote?.geom_json || null);

  const proyectoActual = useMemo(
    () => proyectos.find(p => p.id === proyectoId) || null,
    [proyectos, proyectoId]
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precio por mÂ² calculado
  const precioM2 = useMemo(() => {
    const pl = typeof precioLista === "number" ? precioLista : 0;
    const sup = typeof superficie === "number" ? superficie : 0;
    if (pl > 0 && sup > 0) return pl / sup;
    return 0;
  }, [precioLista, superficie]);

  const bloqueadoPorVenta = editando && (lote?.estado === "VENDIDO" || lote?.estado === "ESCRITURADO");

  async function handleSubmit() {
    setError(null);
    if (!proyectoId) { setError("SeleccionÃ¡ un proyecto"); return; }
    if (!numero.trim()) { setError("NÃºmero de lote obligatorio"); return; }

    setSubmitting(true);
    try {
      const payload: any = {
        tenant,
        proyecto_id: proyectoId,
        numero: numero.trim(),
        manzana: manzana.trim() || null,
        numero_padron: numeroPadron.trim() || null,
        superficie_m2: superficie || null,
        frente_ml: frente || null,
        fondo_ml: fondo || null,
        zona: zona.trim() || null,
        precio_lista: precioLista || null,
        precio_x_m2: precioM2 > 0 ? Math.round(precioM2 * 100) / 100 : null,
        coeficiente: coeficiente || null,
        moneda,
        estado,
        matricula: matricula.trim() || null,
        tiene_agua: tieneAgua,
        tiene_luz: tieneLuz,
        tiene_cloacas: tieneCloacas,
        tiene_gas: tieneGas,
        // geometrÃ­a dibujada en el mapa
        geom_json: geom || null,
      };

      const url = editando ? `/api/lotes/${lote.id}` : `/api/lotes/crear`;
      const method = editando ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al guardar"); setSubmitting(false); return; }
      router.push(`/lotes?t=${tenant}&proy=${proyectoId}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error de conexiÃ³n");
      setSubmitting(false);
    }
  }

  const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "text-xs text-slate-600 mb-1 block";

  return (
    <div className="space-y-6">
      <Link href={`/lotes?t=${tenant}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft size={16} /> Volver al listado
      </Link>

      <h1 className="text-3xl font-bold text-slate-900">{editando ? "Editar Lote" : "Nuevo Lote"}</h1>

      {bloqueadoPorVenta && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          Este lote estÃ¡ {lote.estado}. PodÃ©s editar datos descriptivos, pero cambiar el precio o estado puede afectar ventas. ProcedÃ© con cuidado.
        </div>
      )}

      {/* IdentificaciÃ³n */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">IdentificaciÃ³n</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <label className={labelCls}>Proyecto *</label>
            <select className={inputCls + " bg-white"} value={proyectoId} onChange={e => setProyectoId(e.target.value)} disabled={editando}>
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {editando && <span className="text-xs text-slate-400">El proyecto no se cambia al editar.</span>}
          </div>
          <div><label className={labelCls}>Manzana</label><input className={inputCls} value={manzana} onChange={e => setManzana(e.target.value)} placeholder="Ej: 52" /></div>
          <div><label className={labelCls}>NÃºmero de lote *</label><input className={inputCls} value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ej: 5" /></div>
          <div><label className={labelCls}>NÃºmero de padrÃ³n</label><input className={inputCls} value={numeroPadron} onChange={e => setNumeroPadron(e.target.value)} /></div>
          <div><label className={labelCls}>MatrÃ­cula</label><input className={inputCls} value={matricula} onChange={e => setMatricula(e.target.value)} /></div>
          <div><label className={labelCls}>Zona</label><input className={inputCls} value={zona} onChange={e => setZona(e.target.value)} /></div>
          <div>
            <label className={labelCls}>Estado</label>
            <select className={inputCls + " bg-white"} value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Dimensiones */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Dimensiones</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Superficie (mÂ²)</label>
            <input type="number" step="0.01" className={inputCls} value={superficie === "" ? "" : superficie} onChange={e => setSuperficie(e.target.value ? parseFloat(e.target.value) : "")} />
          </div>
          <div>
            <label className={labelCls}>Frente (ml)</label>
            <input type="number" step="0.01" className={inputCls} value={frente === "" ? "" : frente} onChange={e => setFrente(e.target.value ? parseFloat(e.target.value) : "")} />
          </div>
          <div>
            <label className={labelCls}>Fondo (ml)</label>
            <input type="number" step="0.01" className={inputCls} value={fondo === "" ? "" : fondo} onChange={e => setFondo(e.target.value ? parseFloat(e.target.value) : "")} />
          </div>
        </div>
      </section>

      {/* Precio */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Precio</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Precio lista</label>
            <MoneyInput value={precioLista} onChange={setPrecioLista} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Precio por mÂ² (auto)</label>
            <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-700 font-medium">
              {precioM2 > 0 ? precioM2.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }) : "â€”"}
            </div>
          </div>
          <div>
            <label className={labelCls}>Coeficiente</label>
            <input type="number" step="0.0001" className={inputCls} value={coeficiente === "" ? "" : coeficiente} onChange={e => setCoeficiente(e.target.value ? parseFloat(e.target.value) : "")} />
          </div>
          <div>
            <label className={labelCls}>Moneda</label>
            <select className={inputCls + " bg-white"} value={moneda} onChange={e => setMoneda(e.target.value)}>
              <option value="ARS">ARS (Pesos)</option>
              <option value="USD">USD (DÃ³lares)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Servicios</h2>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={tieneAgua} onChange={e => setTieneAgua(e.target.checked)} /><span className="text-sm">Agua</span></label>
          <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={tieneLuz} onChange={e => setTieneLuz(e.target.checked)} /><span className="text-sm">Luz</span></label>
          <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={tieneCloacas} onChange={e => setTieneCloacas(e.target.checked)} /><span className="text-sm">Cloacas</span></label>
          <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={tieneGas} onChange={e => setTieneGas(e.target.checked)} /><span className="text-sm">Gas</span></label>
        </div>
      </section>

      {/* GeorreferenciaciÃ³n */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-1">GeorreferenciaciÃ³n</h2>
        <p className="text-xs text-slate-500 mb-3">
          DibujÃ¡ el contorno del lote en el mapa. El centro se calcula automÃ¡ticamente.
          {geom?.center && (
            <span className="text-green-700"> Â· Centro actual: {geom.center.lat.toFixed(6)}, {geom.center.lng.toFixed(6)}</span>
          )}
        </p>
        <MapaLote
          initialGeom={lote?.geom_json || null}
          initialCenter={
            proyectoActual?.centro_lat && proyectoActual?.centro_lng
              ? { lat: Number(proyectoActual.centro_lat), lng: Number(proyectoActual.centro_lng) }
              : null
          }
          onChange={setGeom}
        />
        {geom && (
          <button
            type="button"
            onClick={() => setGeom(null)}
            className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
          >
            Quitar geometrÃ­a
          </button>
        )}
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 inline-flex items-start gap-2">
          <XCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link href={`/lotes?t=${tenant}`} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium">Cancelar</Link>
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="inline-flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
          <Save size={16} /> {submitting ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
