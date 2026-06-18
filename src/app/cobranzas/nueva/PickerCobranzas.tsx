"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, User, CheckCircle2, AlertCircle, Calendar } from "lucide-react";

type Persona = {
  id: string;
  nombre: string;
  cuit: string | null;
  doc_numero: string | null;
  cuotas_pendientes: number;
  tiene_vigentes: boolean;
};

export function PickerCobranzas({ tenant }: { tenant: string }) {
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
        // Sin filtro de deudoras: muestra TODOS los clientes (incluso los que cancelaron todo)
        // Con flag include_estado=1 para que devuelva tiene_vigentes
        const res = await fetch(
          `/api/personas/buscar?t=${tenant}&q=${encodeURIComponent(search)}&include_estado=1`,
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
  }, [search, tenant]);

  function seleccionar(personaId: string) {
    // Redirige al detalle de la persona, que tiene la lógica de los 2 botones
    router.push(`/personas/${personaId}?t=${tenant}`);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="font-semibold text-slate-900 mb-1">Buscar cliente</h2>
      <p className="text-sm text-slate-500 mb-4">
        Empezá a escribir nombre, apellido, razón social, CUIT o DNI. Después
        se habilitan los botones de cobro según el estado del cliente.
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
          No se encontraron clientes con ese nombre
        </div>
      )}

      {results.length > 0 && (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
          {results.map((p) => {
            // Estado visual: cancelado (sin pendientes), vigentes (con cuotas vencidas/mes), futuras (al día con cuotas)
            const cancelado = p.cuotas_pendientes === 0;
            const tieneVigentes = p.tiene_vigentes;
            
            return (
              <button
                key={p.id}
                onClick={() => seleccionar(p.id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-center gap-3"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  cancelado ? "bg-green-100" : tieneVigentes ? "bg-red-100" : "bg-blue-100"
                }`}>
                  {cancelado ? (
                    <CheckCircle2 size={18} className="text-green-600" />
                  ) : tieneVigentes ? (
                    <AlertCircle size={18} className="text-red-600" />
                  ) : (
                    <Calendar size={18} className="text-blue-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{p.nombre}</div>
                  <div className="text-xs text-slate-500">
                    {p.cuit || p.doc_numero || "Sin documento"}
                  </div>
                </div>
                <div className="text-right">
                  {cancelado ? (
                    <>
                      <div className="text-sm font-medium text-green-700">Cancelado</div>
                      <div className="text-xs text-slate-500">sin pendientes</div>
                    </>
                  ) : tieneVigentes ? (
                    <>
                      <div className="text-sm font-medium text-red-700">
                        {p.cuotas_pendientes} cuota{p.cuotas_pendientes === 1 ? "" : "s"}
                      </div>
                      <div className="text-xs text-slate-500">con vigentes</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-blue-700">
                        {p.cuotas_pendientes} cuota{p.cuotas_pendientes === 1 ? "" : "s"}
                      </div>
                      <div className="text-xs text-slate-500">al día</div>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
