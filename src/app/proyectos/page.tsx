import { AppShell } from "@/components/AppShell";
import { ProyectoAcciones } from "@/components/ProyectoAcciones";
import { query, getSchema } from "@/lib/db";
import Link from "next/link";
import { Plus, MapPin } from "lucide-react";

const TENANTS_NOMBRES: Record<string, string> = {
  jacaranda: "Jacaranda", tipuana: "Tipuana", alisos: "Alisos", boulevard: "Boulevard",
};

const ESTADO_LABEL: Record<string, string> = {
  EN_OBRA: "En obra",
  TERMINADO: "Terminado",
  APROBADO: "Aprobado",
};

const ESTADO_COLOR: Record<string, string> = {
  EN_OBRA: "bg-blue-100 text-blue-700",
  TERMINADO: "bg-green-100 text-green-700",
  APROBADO: "bg-purple-100 text-purple-700",
};

async function getProyectos(tenant: string) {
  const schema = getSchema(tenant);
  if (!schema) return [];
  return await query(
    `
    SELECT 
      p.id, p.codigo, p.nombre, p.tipo_proyecto, p.estado, p.activo,
      p.localidad, p.provincia,
      p.centro_lat, p.centro_lng,
      (SELECT COUNT(*) FROM ${schema}.lotes l WHERE l.proyecto_id = p.id)::int AS lotes_count,
      (SELECT COUNT(*) FROM ${schema}.lotes l WHERE l.proyecto_id = p.id AND l.estado::text = 'DISPONIBLE')::int AS lotes_disponibles
    FROM ${schema}.proyectos p
    ORDER BY p.activo DESC, p.nombre
    `,
    []
  ) as any[];
}

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  const tenantNombre = TENANTS_NOMBRES[tenant] || tenant;
  const proyectos = await getProyectos(tenant);

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Proyectos</h1>
            <p className="text-slate-500 mt-1">
              {tenantNombre} â€” {proyectos.length} proyecto{proyectos.length === 1 ? "" : "s"}
            </p>
          </div>
          <Link
            href={`/proyectos/nuevo?t=${tenant}`}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
          >
            <Plus size={16} />
            Nuevo Proyecto
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">CÃ³digo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">UbicaciÃ³n</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Mapa</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Lotes (disp.)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">AcciÃ³n</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {proyectos.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 transition ${!p.activo ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 text-sm font-mono text-slate-700">{p.codigo}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{p.nombre}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ESTADO_COLOR[p.estado] || "bg-slate-100 text-slate-600"}`}>
                      {ESTADO_LABEL[p.estado] || p.estado}
                    </span>
                    {!p.activo && (
                      <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs bg-slate-200 text-slate-600">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {p.localidad ? `${p.localidad}${p.provincia ? `, ${p.provincia}` : ""}` : <span className="text-slate-400">â€”</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.centro_lat && p.centro_lng ? (
                      <MapPin size={16} className="inline text-green-600" />
                    ) : (
                      <span className="text-slate-300 text-xs">â€”</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    <span className="font-medium">{p.lotes_count}</span>
                    {p.lotes_count > 0 && (
                      <span className="text-slate-400 text-xs ml-1">({p.lotes_disponibles} disp.)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ProyectoAcciones
                      tenant={tenant}
                      proyectoId={p.id}
                      activo={p.activo !== false}
                      lotesCount={Number(p.lotes_count) || 0}
                      nombre={p.nombre}
                    />
                  </td>
                </tr>
              ))}
              {proyectos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No hay proyectos. CreÃ¡ el primero con el botÃ³n de arriba.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
