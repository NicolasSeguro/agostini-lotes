"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

export function ProyectoAcciones({
  tenant,
  proyectoId,
  activo,
  lotesCount,
  nombre,
}: {
  tenant: string;
  proyectoId: string;
  activo: boolean;
  lotesCount: number;
  nombre: string;
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);

  async function toggle() {
    if (activo) {
      if (!confirm(`Â¿Desactivar "${nombre}"? No aparecerÃ¡ al cargar nuevas ventas. Lotes y ventas existentes no se afectan.`)) return;
    }
    setProcessing(true);
    try {
      if (activo) {
        const res = await fetch(`/api/proyectos/${proyectoId}?t=${tenant}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) { alert(data.error || "Error"); return; }
      } else {
        // Reactivar: leer y guardar con activo=true
        const r = await fetch(`/api/proyectos/${proyectoId}?t=${tenant}`);
        if (!r.ok) { alert("Error al leer proyecto"); return; }
        const { proyecto } = await r.json();
        const tope = proyecto.config?.tope_desc_financiero_pct;
        const res = await fetch(`/api/proyectos/${proyectoId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant,
            codigo: proyecto.codigo,
            nombre: proyecto.nombre,
            tipo_proyecto: proyecto.tipo_proyecto,
            estado: proyecto.estado,
            direccion: proyecto.direccion,
            localidad: proyecto.localidad,
            provincia: proyecto.provincia,
            centro_lat: proyecto.centro_lat,
            centro_lng: proyecto.centro_lng,
            kmz_url: proyecto.kmz_url,
            fecha_lanzamiento: proyecto.fecha_lanzamiento,
            tope_desc_financiero_pct: tope !== null && tope !== undefined ? Number(tope) * 100 : null,
            activo: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || "Error"); return; }
      }
      router.refresh();
    } finally { setProcessing(false); }
  }

  async function eliminar() {
    if (!confirm(`Â¿ELIMINAR PERMANENTEMENTE el proyecto "${nombre}"? Esta acciÃ³n no se puede deshacer.`)) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/proyectos/${proyectoId}?t=${tenant}&fisico=true`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Error"); return; }
      router.refresh();
    } finally { setProcessing(false); }
  }

  const puedeEliminar = lotesCount === 0 && !activo;

  return (
    <div className="inline-flex gap-2 items-center">
      {/* Toggle activa/inactiva */}
      <button
        onClick={toggle}
        disabled={processing}
        role="switch"
        aria-checked={activo}
        title={activo ? "Activo â€” clic para desactivar" : "Inactivo â€” clic para activar"}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
          activo ? "bg-green-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            activo ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <Link
        href={`/proyectos/${proyectoId}/editar?t=${tenant}`}
        className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
        title="Editar"
      >
        <Pencil size={14} />
      </Link>
      {puedeEliminar && (
        <button
          onClick={eliminar}
          disabled={processing}
          className="p-1.5 hover:bg-red-50 rounded text-red-700 disabled:opacity-50"
          title="Eliminar (sin lotes asociados)"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
