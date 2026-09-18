"use client";

import { useEffect, useRef, useState } from "react";

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

type Props = {
  tenant: string;
  lotes: LoteMapa[];
  proyectoCentro?: { lat: number; lng: number } | null;
  // Estados visibles (filtro). Si está vacío, muestra todos.
  estadosVisibles: Set<string>;
};

const JUJUY = { lat: -24.1858, lng: -65.2995 };

// 3 categorías de color (decisión confirmada):
//   DISPONIBLE          -> verde
//   RESERVADO           -> amarillo
//   resto (no disponible) -> rojo
function colorPorEstado(estado: string): { fill: string; border: string; label: string } {
  if (estado === "DISPONIBLE") return { fill: "#22c55e", border: "#15803d", label: "Disponible" };
  if (estado === "RESERVADO") return { fill: "#eab308", border: "#854d0e", label: "Reservado" };
  return { fill: "#ef4444", border: "#991b1b", label: "No disponible" };
}

function formatMoney(n: number | null): string {
  if (!n) return "—";
  return Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export function MapaProyecto({ tenant, lotes, proyectoCentro, estadosVisibles }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const polygonsRef = useRef<Map<string, any>>(new Map());
  const Lref = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Init del mapa (una vez)
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");

        if (cancelled || !mapRef.current) return;
        if (mapInstance.current) return;
        Lref.current = L;

        // Centro inicial
        const center = proyectoCentro?.lat ? proyectoCentro : JUJUY;
        const map = L.map(mapRef.current).setView([center.lat, center.lng], proyectoCentro ? 17 : 13);
        mapInstance.current = map;

        // Capas
        const satelital = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 21, attribution: "Esri" }
        ).addTo(map);
        const calles = L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          { maxZoom: 19, attribution: "OpenStreetMap" }
        );
        L.control.layers({ "Satelital": satelital, "Calles": calles }, {}).addTo(map);

        setLoaded(true);
        setTimeout(() => map.invalidateSize(), 200);
      } catch (err: any) {
        console.error("[MapaProyecto] error:", err);
        setError("No se pudo cargar el mapa. Verificá la conexión a internet.");
      }
    }
    initMap();

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      polygonsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render de polígonos cuando cambian los lotes, su filtro, o cuando el mapa ya cargó
  useEffect(() => {
    const L = Lref.current;
    const map = mapInstance.current;
    if (!L || !map || !loaded) return;

    // Limpiar polígonos previos
    polygonsRef.current.forEach((p) => map.removeLayer(p));
    polygonsRef.current.clear();

    const filtroActivo = estadosVisibles.size > 0;
    const bounds: any[] = [];

    for (const lote of lotes) {
      // Determinar categoría visible
      const cat = lote.estado === "DISPONIBLE"
        ? "DISPONIBLE"
        : lote.estado === "RESERVADO"
          ? "RESERVADO"
          : "NO_DISPONIBLE";

      if (filtroActivo && !estadosVisibles.has(cat)) continue;

      const polyCoords = lote.geom_json?.polygon;
      if (!polyCoords || !Array.isArray(polyCoords) || polyCoords.length < 3) continue;

      const c = colorPorEstado(lote.estado);
      const poly = L.polygon(polyCoords, {
        color: c.border, weight: 2, fillColor: c.fill, fillOpacity: 0.45,
      });

      const numLabel = lote.manzana ? `M${lote.manzana}-L${lote.numero}` : `L${lote.numero}`;
      const popup = `
        <div style="font-size:13px; min-width:180px">
          <div style="font-weight:600; font-size:14px; margin-bottom:4px">${numLabel}</div>
          <div style="margin-bottom:2px">
            <span style="display:inline-block; padding:1px 6px; border-radius:3px; background:${c.fill}; color:white; font-size:11px; font-weight:500">${c.label}</span>
            <span style="color:#64748b; font-size:11px"> (${lote.estado})</span>
          </div>
          ${lote.superficie_m2 ? `<div style="color:#475569"><b>Superficie:</b> ${Number(lote.superficie_m2).toLocaleString("es-AR")} m²</div>` : ""}
          ${lote.precio_lista ? `<div style="color:#475569"><b>Precio:</b> ${formatMoney(lote.precio_lista)}</div>` : ""}
          ${lote.comprador_actual ? `<div style="color:#475569"><b>Comprador:</b> ${lote.comprador_actual}</div>` : ""}
          <div style="margin-top:8px; display:flex; gap:6px">
            <a href="/lotes/${lote.id}?t=${tenant}" style="color:#ea580c; font-weight:500; text-decoration:none; font-size:12px">Ver detalle →</a>
            <a href="/lotes/${lote.id}/editar?t=${tenant}" style="color:#475569; text-decoration:none; font-size:12px">Editar</a>
          </div>
        </div>
      `;
      poly.bindPopup(popup);
      poly.addTo(map);
      polygonsRef.current.set(lote.id, poly);
      bounds.push(...polyCoords);
    }

    // Ajustar bounds al conjunto de lotes visibles (si hay)
    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 });
      } catch { /* ignore */ }
    }
  }, [lotes, estadosVisibles, loaded, tenant]);

  return (
    <div>
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-2">{error}</div>
      )}
      <div className="rounded-lg overflow-hidden border border-slate-300">
        <div ref={mapRef} style={{ height: "600px", width: "100%" }} />
      </div>
      {!loaded && !error && <p className="text-xs text-slate-400 mt-1">Cargando mapa...</p>}
    </div>
  );
}
