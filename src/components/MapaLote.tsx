"use client";

import { useEffect, useRef, useState } from "react";

type GeomData = {
  polygon: number[][];   // array de [lat, lng]
  center: { lat: number; lng: number };
} | null;

type Props = {
  // Geometría inicial (al editar). Formato esperado: { polygon: [[lat,lng],...], center: {lat,lng} }
  initialGeom?: any;
  // Centro inicial del mapa (centro del proyecto). Fallback: San Salvador de Jujuy.
  initialCenter?: { lat: number; lng: number } | null;
  // Callback cuando cambia la geometría
  onChange: (geom: GeomData) => void;
};

// San Salvador de Jujuy
const JUJUY_CENTER = { lat: -24.1858, lng: -65.2995 };

function calcularCentro(latlngs: number[][]): { lat: number; lng: number } {
  if (latlngs.length === 0) return JUJUY_CENTER;
  let sumLat = 0, sumLng = 0;
  for (const [lat, lng] of latlngs) { sumLat += lat; sumLng += lng; }
  return { lat: sumLat / latlngs.length, lng: sumLng / latlngs.length };
}

export function MapaLote({ initialGeom, initialCenter, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const drawnItems = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      try {
        // Importar Leaflet y leaflet-draw dinámicamente (solo cliente)
        const L = (await import("leaflet")).default;
        await import("leaflet-draw");
        // CSS
        await import("leaflet/dist/leaflet.css");
        await import("leaflet-draw/dist/leaflet.draw.css");

        if (cancelled || !mapRef.current) return;
        // Evitar doble inicialización
        if (mapInstance.current) return;

        // Centro: initialGeom > initialCenter > Jujuy
        let centerStart = JUJUY_CENTER;
        let zoomStart = 13;
        if (initialGeom?.center?.lat) {
          centerStart = initialGeom.center;
          zoomStart = 18;
        } else if (initialCenter?.lat) {
          centerStart = initialCenter;
          zoomStart = 16;
        }

        const map = L.map(mapRef.current).setView([centerStart.lat, centerStart.lng], zoomStart);
        mapInstance.current = map;

        // Capa satelital de Esri (gratis, sin API key)
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 21, attribution: "Esri" }
        ).addTo(map);

        // Capa de calles (toggle)
        const calles = L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          { maxZoom: 19, attribution: "OpenStreetMap" }
        );
        L.control.layers(
          { "Satelital": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 21 }).addTo(map), "Calles": calles },
          {}
        ).addTo(map);

        // Capa de dibujo
        const items = new L.FeatureGroup();
        map.addLayer(items);
        drawnItems.current = items;

        // Cargar polígono existente
        if (initialGeom?.polygon && Array.isArray(initialGeom.polygon) && initialGeom.polygon.length >= 3) {
          const poly = L.polygon(initialGeom.polygon, { color: "#ea580c", weight: 2 });
          items.addLayer(poly);
        }

        // Control de dibujo
        const drawControl = new (L as any).Control.Draw({
          edit: { featureGroup: items, remove: true },
          draw: {
            polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: "#ea580c", weight: 2 } },
            polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false,
          },
        });
        map.addControl(drawControl);

        function emitChange() {
          const layers = items.getLayers();
          if (layers.length === 0) { onChange(null); return; }
          const poly = layers[layers.length - 1] as any;
          const latlngs = poly.getLatLngs()[0].map((p: any) => [p.lat, p.lng]);
          const center = calcularCentro(latlngs);
          onChange({ polygon: latlngs, center });
        }

        // Al crear un polígono nuevo, borrar el anterior (solo 1 por lote)
        map.on((L as any).Draw.Event.CREATED, (e: any) => {
          items.clearLayers();
          items.addLayer(e.layer);
          emitChange();
        });
        map.on((L as any).Draw.Event.EDITED, () => emitChange());
        map.on((L as any).Draw.Event.DELETED, () => emitChange());

        setLoaded(true);
        // Forzar recálculo de tamaño (a veces el contenedor no está listo)
        setTimeout(() => map.invalidateSize(), 200);
      } catch (err: any) {
        console.error("[MapaLote] error:", err);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-2">{error}</div>
      )}
      <div className="rounded-lg overflow-hidden border border-slate-300">
        <div ref={mapRef} style={{ height: "420px", width: "100%" }} />
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Usá la herramienta de polígono (ícono arriba a la izquierda del mapa) para dibujar el contorno del lote.
        Hacé click en cada esquina y cerrá el polígono en el punto inicial. Podés editarlo arrastrando los vértices.
      </p>
      {!loaded && !error && <p className="text-xs text-slate-400 mt-1">Cargando mapa...</p>}
    </div>
  );
}
