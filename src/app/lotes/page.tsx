import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { formatMoney, formatNumber } from "@/lib/utils";
import Link from "next/link";
import { Search, MapPin, Plus, Pencil, Download, Upload } from "lucide-react";

async function getProyectos(tenantSlug: string) {
  const schema = getSchema(tenantSlug);
  return await query(`
    SELECT id, codigo, nombre, tipo_proyecto,
      (SELECT COUNT(*) FROM ${schema}.lotes l WHERE l.proyecto_id = p.id)::int AS cant_lotes
    FROM ${schema}.proyectos p
    ORDER BY 
      CASE WHEN p.tipo_proyecto = 'HISTORICO' THEN 1 ELSE 0 END,
      p.nombre
  `);
}

async function getLotes(
  tenantSlug: string,
  proyectoId: string | null,
  estado: string | null,
  search: string,
  offset: number
) {
  const schema = getSchema(tenantSlug);
  const LIMIT = 50;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (proyectoId) {
    conditions.push(`l.proyecto_id = $${idx++}`);
    params.push(proyectoId);
  }
  if (estado) {
    conditions.push(`l.estado::text = $${idx++}`);
    params.push(estado);
  }
  if (search) {
    conditions.push(`(
      UPPER(COALESCE(l.numero,'')) LIKE UPPER($${idx}) OR
      UPPER(COALESCE(l.manzana,'')) LIKE UPPER($${idx}) OR
      UPPER(COALESCE(l.numero_padron,'')) LIKE UPPER($${idx})
    )`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(LIMIT, offset);

  const lotes = await query(`
    SELECT 
      l.id, l.numero, l.manzana, l.superficie_m2, l.zona,
      l.precio_lista, l.estado, l.tiene_agua, l.tiene_luz,
      p.nombre AS proyecto_nombre, p.codigo AS proyecto_codigo,
      p.tipo_proyecto,
      (SELECT v.id FROM ${schema}.ventas v WHERE v.lote_id = l.id ORDER BY v.fecha DESC LIMIT 1) AS venta_id_actual,
      (SELECT per.razon_social || COALESCE(per.apellido || ', ' || per.nombre, '')
       FROM ${schema}.ventas v
       JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id
       JOIN ${schema}.personas per ON per.id = vt.persona_id
       WHERE v.lote_id = l.id 
       ORDER BY v.fecha DESC LIMIT 1) AS comprador_actual
    FROM ${schema}.lotes l
    JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
    ${whereClause}
    ORDER BY p.nombre, l.numero
    LIMIT $${idx++} OFFSET $${idx}
  `, params);

  // Total separado
  const countParams = params.slice(0, -2);
  const totalRes = await query(`
    SELECT COUNT(*)::int AS total 
    FROM ${schema}.lotes l
    JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
    ${whereClause}
  `, countParams);

  return { lotes: lotes as any[], total: totalRes[0].total, limit: LIMIT };
}

const ESTADOS = [
  { value: "DISPONIBLE", label: "Disponible", color: "bg-green-100 text-green-700" },
  { value: "RESERVADO", label: "Reservado", color: "bg-amber-100 text-amber-700" },
  { value: "VENDIDO", label: "Vendido", color: "bg-blue-100 text-blue-700" },
  { value: "ESCRITURADO", label: "Escriturado", color: "bg-purple-100 text-purple-700" },
  { value: "RESCINDIDO", label: "Rescindido", color: "bg-slate-100 text-slate-600" },
];

function getEstadoStyle(estado: string) {
  return ESTADOS.find((e) => e.value === estado) || { label: estado, color: "bg-slate-100 text-slate-700" };
}

export default async function LotesPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; proy?: string; estado?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const proyectoId = params.proy || null;
  const estado = params.estado || null;
  const search = params.q || "";
  const page = parseInt(params.page || "1");
  const offset = (page - 1) * 50;

  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  const [proyectos, { lotes, total, limit }] = await Promise.all([
    getProyectos(tenant),
    getLotes(tenant, proyectoId, estado, search, offset),
  ]);

  const totalPages = Math.ceil(total / limit);

  // Helper para construir URLs preservando filtros
  function buildUrl(extra: Record<string, string | null>) {
    const sp = new URLSearchParams();
    sp.set("t", tenant);
    if (proyectoId && !("proy" in extra)) sp.set("proy", proyectoId);
    if (estado && !("estado" in extra)) sp.set("estado", estado);
    if (search && !("q" in extra)) sp.set("q", search);
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    return `/lotes?${sp.toString()}`;
  }

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Lotes</h1>
            <p className="text-slate-500 mt-1">
              {tenantNombre} â€” {formatNumber(total)} lote{total === 1 ? "" : "s"}
              {(proyectoId || estado || search) && " (filtrados)"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a
              href={`/api/lotes/exportar?t=${tenant}${proyectoId ? `&proy=${proyectoId}` : ""}${estado ? `&estado=${estado}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
              className="inline-flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
              title="Exportar lotes filtrados a Excel"
            >
              <Download size={16} />
              Exportar Excel
            </a>
            <Link
              href={`/lotes/importar?t=${tenant}`}
              className="inline-flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
              title="Importar Excel editado"
            >
              <Upload size={16} />
              Importar Excel
            </Link>
            <Link
              href={`/lotes/mapa?t=${tenant}${proyectoId ? `&proy=${proyectoId}` : ""}`}
              className="inline-flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
            >
              <MapPin size={16} />
              Ver en mapa
            </Link>
            <Link
              href={`/lotes/nuevo?t=${tenant}${proyectoId ? `&proy=${proyectoId}` : ""}`}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
            >
              <Plus size={16} />
              Nuevo Lote
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <form className="space-y-3">
            <input type="hidden" name="t" value={tenant} />

            {/* BÃºsqueda */}
            <div className="relative">
              <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                name="q"
                defaultValue={search}
                placeholder="Buscar por nÃºmero de lote, manzana, padrÃ³n..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            {/* Filtros en lÃ­nea */}
            <div className="flex flex-wrap gap-3 items-center">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Proyecto</label>
                <select
                  name="proy"
                  defaultValue={proyectoId || ""}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Todos los proyectos</option>
                  {proyectos.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.cant_lotes})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Estado</label>
                <select
                  name="estado"
                  defaultValue={estado || ""}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Todos los estados</option>
                  {ESTADOS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 self-end">
                <button
                  type="submit"
                  className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
                >
                  Aplicar filtros
                </button>
                {(proyectoId || estado || search) && (
                  <Link
                    href={`/lotes?t=${tenant}`}
                    className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-300 rounded-lg"
                  >
                    Limpiar
                  </Link>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Proyecto / Lote
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Superficie
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Zona
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Precio Lista
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Comprador actual
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    AcciÃ³n
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lotes.map((l) => {
                  const estStyle = getEstadoStyle(l.estado);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50 transition cursor-pointer">
                      <td className="px-4 py-3">
                        <Link href={`/lotes/${l.id}?t=${tenant}`} className="block">
                          <div className="font-medium text-slate-900">
                            {l.numero}
                          </div>
                          <div className="text-xs text-slate-500">
                            {l.proyecto_nombre}
                            {l.manzana && ` Â· Mz ${l.manzana}`}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${estStyle.color}`}>
                          {estStyle.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {l.superficie_m2 ? `${formatNumber(l.superficie_m2)} mÂ²` : "â€”"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {l.zona || "â€”"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-slate-900 font-medium">
                        {formatMoney(l.precio_lista)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {l.comprador_actual ? (
                          <span className="line-clamp-1 max-w-[220px]">{l.comprador_actual}</span>
                        ) : (
                          <span className="text-slate-400">â€”</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/lotes/${l.id}/editar?t=${tenant}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-100 text-slate-700"
                        >
                          <Pencil size={12} /> Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {lotes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No se encontraron lotes con esos filtros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                PÃ¡gina {page} de {totalPages}
              </div>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={buildUrl({ page: String(page - 1) })}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white"
                  >
                    Anterior
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={buildUrl({ page: String(page + 1) })}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white"
                  >
                    Siguiente
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
