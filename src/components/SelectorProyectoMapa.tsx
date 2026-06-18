"use client";

import { useRouter } from "next/navigation";

type Proyecto = { id: string; nombre: string };

export function SelectorProyectoMapa({
  tenant,
  proyectos,
  proyectoActual,
}: {
  tenant: string;
  proyectos: Proyecto[];
  proyectoActual: string | null;
}) {
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const params = new URLSearchParams();
    params.set("t", tenant);
    if (v) params.set("proy", v);
    router.push(`/lotes/mapa?${params.toString()}`);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <label className="text-xs text-slate-600 mb-1 block">Proyecto</label>
      <select
        defaultValue={proyectoActual || ""}
        onChange={onChange}
        className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">Todos los proyectos del fideicomiso</option>
        {proyectos.map(p => (
          <option key={p.id} value={p.id}>{p.nombre}</option>
        ))}
      </select>
    </div>
  );
}
