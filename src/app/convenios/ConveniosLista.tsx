"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Edit, XCircle, Trash2, CheckCircle2 } from "lucide-react";

type Convenio = {
  id: string;
  razon_social: string;
  cuit: string;
  fecha_inicio: string | Date;
  fecha_fin: string | Date;
  tipo_beneficio: "PORCENTAJE" | "MONTO_FIJO";
  valor_beneficio: string | number;
  tenants_aplicables: string[];
  activo: boolean;
  ventas_count: number;
  situacion: "VIGENTE" | "PROXIMO" | "VENCIDO" | "INACTIVO";
};

// Defensivo: maneja Date u string ISO
function toDateInputStr(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  try { return new Date(d).toISOString().slice(0, 10); } catch { return ""; }
}

const TENANT_LABELS: Record<string, string> = {
  jacaranda: "Jacaranda",
  tipuana: "Tipuana",
  alisos: "Alisos",
  boulevard: "Boulevard",
};

const SITUACION_STYLE: Record<string, { label: string; color: string }> = {
  VIGENTE:  { label: "Vigente",  color: "bg-green-100 text-green-700" },
  PROXIMO:  { label: "PrÃ³ximo",  color: "bg-blue-100 text-blue-700" },
  VENCIDO:  { label: "Vencido",  color: "bg-amber-100 text-amber-700" },
  INACTIVO: { label: "Inactivo", color: "bg-slate-100 text-slate-500" },
};

function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(d: string | Date): string {
  if (!d) return "â€”";
  try { 
    const s = toDateInputStr(d);
    if (!s) return "â€”";
    return new Date(s + "T00:00:00").toLocaleDateString("es-AR"); 
  } catch { return String(d); }
}

function formatBeneficio(c: Convenio): string {
  const v = parseFloat(String(c.valor_beneficio));
  return c.tipo_beneficio === "PORCENTAJE" ? `${v}%` : formatMoney(v);
}

export function ConveniosLista({ tenant, convenios }: { tenant: string; convenios: Convenio[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  async function bajaLogica(id: string, razon: string) {
    if (!confirm(`Â¿Dar de baja el convenio "${razon}"? Las ventas existentes no se afectan, pero no aparecerÃ¡ en nuevas ventas.`)) return;
    setProcessing(id);
    try {
      const res = await fetch(`/api/convenios/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      router.refresh();
    } finally { setProcessing(null); }
  }

  async function activar(id: string) {
    // Activar = PUT con activo=true. Pero necesito el resto de los campos.
    // MÃ¡s simple: hacer un endpoint GET, recibir el convenio y hacer PUT manteniendo todo + activo=true
    setProcessing(id);
    try {
      const r = await fetch(`/api/convenios/${id}`);
      if (!r.ok) { setError("Error al leer"); return; }
      const data = await r.json();
      const c = data.convenio;
      const res = await fetch(`/api/convenios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razon_social: c.razon_social,
          cuit: c.cuit,
          fecha_inicio: toDateInputStr(c.fecha_inicio),
          fecha_fin: toDateInputStr(c.fecha_fin),
          tipo_beneficio: c.tipo_beneficio,
          valor_beneficio: c.valor_beneficio,
          tenants_aplicables: c.tenants_aplicables,
          observaciones: c.observaciones,
          activo: true,
        }),
      });
      const data2 = await res.json();
      if (!res.ok) { setError(data2.error || "Error"); return; }
      router.refresh();
    } finally { setProcessing(null); }
  }

  async function borrarFisico(id: string, razon: string) {
    if (!confirm(`Â¿ELIMINAR PERMANENTEMENTE el convenio "${razon}"? Esta acciÃ³n no se puede deshacer.`)) return;
    setProcessing(id);
    try {
      const res = await fetch(`/api/convenios/${id}?fisico=true`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      router.refresh();
    } finally { setProcessing(null); }
  }

  function formatCuit(cuit: string): string {
    const c = cuit.replace(/[^0-9]/g, "");
    if (c.length !== 11) return cuit;
    return `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
  }

  return (
    <>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 mb-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">RazÃ³n social / CUIT</th>
              <th className="px-4 py-3">Beneficio</th>
              <th className="px-4 py-3">Vigencia</th>
              <th className="px-4 py-3">Aplica a</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Ventas</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {convenios.map(c => {
              const sit = SITUACION_STYLE[c.situacion] || SITUACION_STYLE.INACTIVO;
              const puedeEliminar = c.ventas_count === 0 && !c.activo;
              return (
                <tr key={c.id} className={c.activo ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <Link href={`/convenios/${c.id}/editar?t=${tenant}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {c.razon_social}
                    </Link>
                    <div className="text-xs text-slate-500 font-mono">{formatCuit(c.cuit)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 bg-brand-50 text-brand-700 rounded text-xs font-medium">
                      {formatBeneficio(c)}
                    </span>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {c.tipo_beneficio === "PORCENTAJE" ? "% sobre lista" : "monto fijo"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{formatDate(c.fecha_inicio)}</div>
                    <div className="text-slate-500">hasta {formatDate(c.fecha_fin)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tenants_aplicables.map(t => (
                        <span key={t} className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                          {TENANT_LABELS[t] || t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${sit.color}`}>
                      {sit.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium">
                    {c.ventas_count}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Link
                        href={`/convenios/${c.id}/editar?t=${tenant}`}
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                        title="Editar"
                      >
                        <Edit size={14} />
                      </Link>
                      {c.activo ? (
                        <button
                          onClick={() => bajaLogica(c.id, c.razon_social)}
                          disabled={processing === c.id}
                          className="p-1.5 hover:bg-red-50 rounded text-red-600 disabled:opacity-50"
                          title="Dar de baja"
                        >
                          <XCircle size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => activar(c.id)}
                          disabled={processing === c.id}
                          className="p-1.5 hover:bg-green-50 rounded text-green-600 disabled:opacity-50"
                          title="Reactivar"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          onClick={() => borrarFisico(c.id, c.razon_social)}
                          disabled={processing === c.id}
                          className="p-1.5 hover:bg-red-50 rounded text-red-700 disabled:opacity-50"
                          title="Eliminar definitivamente (sin ventas asociadas)"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
