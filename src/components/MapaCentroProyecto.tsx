"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  initialLat?: number | null;
  initialLng?: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
};

const JUJUY = { lat: -24.1858, lng: -65.2995 };

export function MapaCentroProyecto({ initialLat, initialLng, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: Number(initialLat), lng: Number(initialLng) } : null
  );

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");

        if (cancelled || !mapRef.current) return;
        if (mapInstance.current) return;

        const start = coords || JUJUY;
        const zoomStart = coords ? 17 : 13;
        const map = L.map(mapRef.current).setView([start.lat, start.lng], zoomStart);
        mapInstance.current = map;

        // Capa satelital + toggle
        const satelital = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 21, attribution: "Esri" }
        ).addTo(map);
        const calles = L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          { maxZoom: 19, attribution: "OpenStreetMap" }
        );
        L.control.layers({ "Satelital": satelital, "Calles": calles }, {}).addTo(map);

        // Ãcono Leaflet por defecto necesita arreglo manual con bundlers
        const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
        const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
        const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";
        const DefaultIcon = L.icon({
          iconUrl, iconRetinaUrl, shadowUrl,
          iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
        });

        // Marker inicial si hay coords
        if (coords) {
          markerRef.current = L.marker([coords.lat, coords.lng], { icon: DefaultIcon, draggable: true }).addTo(map);
          markerRef.current.on("dragend", () => {
            const ll = markerRef.current.getLatLng();
            setCoords({ lat: ll.lat, lng: ll.lng });
            onChange(ll.lat, ll.lng);
          });
        }

        // Click en el mapa: setea/mueve el marker
        map.on("click", (e: any) => {
          const { lat, lng } = e.latlng;
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          } else {
            markerRef.current = L.marker([lat, lng], { icon: DefaultIcon, draggable: true }).addTo(map);
            markerRef.current.on("dragend", () => {
              const ll = markerRef.current.getLatLng();
              setCoords({ lat: ll.lat, lng: ll.lng });
              onChange(ll.lat, ll.lng);
            });
          }
          setCoords({ lat, lng });
          onChange(lat, lng);
        });

        setLoaded(true);
        setTimeout(() => map.invalidateSize(), 200);
      } catch (err: any) {
        console.error("[MapaCentroProyecto]", err);
        setError("No se pudo cargar el mapa. VerificÃ¡ la conexiÃ³n.");
      }
    }
    initMap();

    return () => {
      cancelled = true;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limpiar() {
    if (markerRef.current && mapInstance.current) {
      mapInstance.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    setCoords(null);
    onChange(null, null);
  }

  return (
    <div>
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-2">{error}</div>}
      <div className="rounded-lg overflow-hidden border border-slate-300">
        <div ref={mapRef} style={{ height: "380px", width: "100%" }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <p className="text-slate-500">
          Click en el mapa para marcar el centro del proyecto. PodÃ©s arrastrar el marcador para ajustarlo.
        </p>
        {coords && (
          <div className="flex items-center gap-2 text-slate-700">
            <span className="font-mono">{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</span>
            <button type="button" onClick={limpiar} className="text-red-600 hover:text-red-700 underline">
              Quitar
            </button>
          </div>
        )}
      </div>
      {!loaded && !error && <p className="text-xs text-slate-400 mt-1">Cargando mapa...</p>}
    </div>
  );
}
