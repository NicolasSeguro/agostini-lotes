"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, User } from "lucide-react";

type Persona = {
  id: string;
  nombre: string;
  cuit: string | null;
  doc_numero: string | null;
  cuotas_pendientes: number;
};

export function PickerCliente({
  tenant,
  destino = "vigentes",
}: {
  tenant: string;
  destino?: "vigentes" | "adelanto";
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (search.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setTouched(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        // Si destino es adelanto, solo mostrar clientes al día
        const extraParam = destino === "adelanto" ? "&al_dia=1" : "&deudoras=1";
        const res = await fetch(
          `/api/personas/buscar?t=${tenant}&q=${encodeURIComponent(search)}${extraParam}`,
          { signal: ctrl.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch (e) {
        // abortado
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [search, tenant, destino]);

  function seleccionar(personaId: string) {
    router.push(`/cobranzas/nueva/${destino}?t=${tenant}&persona=${personaId}`);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="font-semibold text-slate-900 mb-1">Buscar cliente</h2>
      <p className="text-sm text-slate-500 mb-4">
        {destino === "adelanto" 
          ? "Solo se muestran clientes al día (sin cuotas vigentes pendientes)."
          : "Empezá a escribir nombre, apellido, razón social, CUIT o DNI."}
      </p>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          placeholder="Mancilla, Mendieta, 20-12345678-9..."
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {loading && <div className="text-sm text-slate-500 text-center py-4">Buscando...</div>}

      {!loading && touched && results.length === 0 && search.length >= 2 && (
        <div className="text-sm text-slate-500 text-center py-8">
          {destino === "adelanto" 
            ? "No se encontraron clientes al día con ese nombre. Si el cliente tiene cuotas vencidas, primero cobralas como vigentes."
            : "No se encontraron clientes con cuotas pendientes"}
        </div>
      )}

      {results.length > 0 && (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => seleccionar(p.id)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-center gap-3"
            >
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-slate-500" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-slate-900">{p.nombre}</div>
                <div className="text-xs text-slate-500">
                  {p.cuit || p.doc_numero || "Sin documento"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-brand-700">
                  {p.cuotas_pendientes} cuota{p.cuotas_pendientes === 1 ? "" : "s"}
                </div>
                <div className="text-xs text-slate-500">pendiente{p.cuotas_pendientes === 1 ? "" : "s"}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
