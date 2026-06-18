"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const MapaProyecto = dynamic(() => import("@/components/MapaProyecto").then(m => m.MapaProyecto), {
  ssr: false,
  loading: () => <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-sm">Cargando mapa...</div>,
});

type LoteMapa = {
  id: string;
  numero: string;
  manzana: string | null;
  estado: string;
  precio_lista: number | null;
  superficie_m2: number | null;
  comprador_actual: string | null;
  geom_json: any;
};

const CATEGORIAS = [
  { key: "DISPONIBLE",    label: "Disponible",    color: "bg-green-500" },
  { key: "RESERVADO",     label: "Reservado",     color: "bg-yellow-500" },
  { key: "NO_DISPONIBLE", label: "No disponible", color: "bg-red-500" },
];

function contar(lotes: LoteMapa[], cat: string): number {
  return lotes.filter(l => {
    if (cat === "DISPONIBLE") return l.estado === "DISPONIBLE";
    if (cat === "RESERVADO") return l.estado === "RESERVADO";
    return l.estado !== "DISPONIBLE" && l.estado !== "RESERVADO";
  }).length;
}

export function MapaProyectoCliente({
  tenant,
  lotes,
  proyectoCentro,
}: {
  tenant: string;
  lotes: LoteMapa[];
  proyectoCentro?: { lat: number; lng: number } | null;
}) {
  // Estado: quÃ© categorÃ­as estÃ¡n visibles. Set vacÃ­o = ver todas.
  // Por simetrÃ­a con la leyenda clickeable, mantengo el set con las activas.
  const [activas, setActivas] = useState<Set<string>>(new Set(CATEGORIAS.map(c => c.key)));

  function toggle(cat: string) {
    const next = new Set(activas);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setActivas(next);
  }

  return (
    <div className="space-y-3">
      {/* Leyenda clickeable */}
      <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500 uppercase tracking-wider font-medium mr-1">Filtrar:</span>
        {CATEGORIAS.map(c => {
          const activo = activas.has(c.key);
          const total = contar(lotes, c.key);
          return (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border text-sm transition ${
                activo
                  ? "border-slate-300 bg-white text-slate-800"
                  : "border-slate-200 bg-slate-50 text-slate-400 opacity-60"
              }`}
              title={activo ? "Ocultar" : "Mostrar"}
            >
              <span className={`w-3 h-3 rounded-sm ${c.color} ${activo ? "" : "opacity-40"}`} />
              <span className="font-medium">{c.label}</span>
              <span className="text-xs text-slate-500">({total})</span>
            </button>
          );
        })}
      </div>

      <MapaProyecto
        tenant={tenant}
        lotes={lotes}
        proyectoCentro={proyectoCentro}
        estadosVisibles={activas}
      />
    </div>
  );
}
