"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

export function PersonaAcciones({
  tenant,
  personaId,
  activo,
  ventasCount,
  nombre,
}: {
  tenant: string;
  personaId: string;
  activo: boolean;
  ventasCount: number;
  nombre: string;
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function desactivar() {
    if (!confirm(`¿Desactivar a "${nombre}"? No aparecerá al cargar nuevas ventas. Las ventas existentes no se afectan.`)) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/personas/${personaId}?t=${tenant}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); alert(data.error || "Error"); return; }
      router.refresh();
    } finally { setProcessing(false); }
  }

  async function reactivar() {
    setProcessing(true);
    try {
      // Leer la persona y volver a guardarla con activo=true
      const r = await fetch(`/api/personas/${personaId}?t=${tenant}`);
      if (!r.ok) { alert("Error al leer persona"); return; }
      const { persona } = await r.json();
      const res = await fetch(`/api/personas/${personaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...persona, tenant, activo: true }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Error"); return; }
      router.refresh();
    } finally { setProcessing(false); }
  }

  async function eliminar() {
    if (!confirm(`¿ELIMINAR PERMANENTEMENTE a "${nombre}"? Esta acción no se puede deshacer.`)) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/personas/${personaId}?t=${tenant}&fisico=true`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Error"); return; }
      router.refresh();
    } finally { setProcessing(false); }
  }

  const puedeEliminar = ventasCount === 0 && !activo;

  function onToggle() {
    if (activo) desactivar();
    else reactivar();
  }

  return (
    <div className="inline-flex gap-2 items-center">
      {/* Toggle activa/inactiva */}
      <button
        onClick={onToggle}
        disabled={processing}
        role="switch"
        aria-checked={activo}
        title={activo ? "Activa — clic para desactivar" : "Inactiva — clic para activar"}
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
        href={`/personas/${personaId}/editar?t=${tenant}`}
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
          title="Eliminar definitivamente (sin ventas asociadas)"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
