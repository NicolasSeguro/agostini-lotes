import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import Link from "next/link";
import { Search, AlertCircle, Plus } from "lucide-react";
import { PersonaAcciones } from "@/components/PersonaAcciones";

async function getPersonas(tenantSlug: string, search: string, soloMora: boolean, offset: number) {
  const schema = getSchema(tenantSlug);
  const LIMIT = 50;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(
      UPPER(COALESCE(p.apellido,'')) LIKE UPPER($${idx}) OR
      UPPER(COALESCE(p.nombre,'')) LIKE UPPER($${idx}) OR
      UPPER(COALESCE(p.razon_social,'')) LIKE UPPER($${idx}) OR
      REPLACE(COALESCE(p.cuit,''), '-', '') LIKE REPLACE($${idx}, '-', '') OR
      UPPER(COALESCE(p.doc_numero,'')) LIKE UPPER($${idx})
    )`);
    params.push(`%${search}%`);
    idx++;
  }
  if (soloMora) {
    conditions.push(`EXISTS (
      SELECT 1 FROM ${schema}.venta_titulares vt
      JOIN ${schema}.cuotas c ON c.venta_id = vt.venta_id
      WHERE vt.persona_id = p.id
        AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
        AND c.fecha_vto < CURRENT_DATE
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(LIMIT, offset);

  const personas = await query(`
    SELECT 
      p.id,
      p.tipo,
      p.cuit,
      p.doc_tipo,
      p.doc_numero,
      p.apellido,
      p.nombre,
      p.razon_social,
      p.email,
      p.telefono,
      p.activo,
      (SELECT COUNT(*) FROM ${schema}.venta_titulares vt WHERE vt.persona_id = p.id) AS ventas_count,
      EXISTS (
        SELECT 1 FROM ${schema}.venta_titulares vt
        JOIN ${schema}.cuotas c ON c.venta_id = vt.venta_id
        WHERE vt.persona_id = p.id
          AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
          AND c.fecha_vto < CURRENT_DATE
      ) AS tiene_mora
    FROM ${schema}.personas p
    ${whereClause}
    ORDER BY 
      COALESCE(p.apellido, p.razon_social) NULLS LAST,
      p.nombre
    LIMIT $${idx++} OFFSET $${idx}
  `, params);

  const countParams = params.slice(0, -2);
  const totalRes = await query(`
    SELECT COUNT(*)::int AS total FROM ${schema}.personas p ${whereClause}
  `, countParams);

  return {
    personas: personas as any[],
    total: totalRes[0].total,
    limit: LIMIT,
  };
}

export default async function PersonasPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; q?: string; mora?: string; page?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const search = params.q || "";
  const soloMora = params.mora === "1";
  const page = parseInt(params.page || "1");
  const offset = (page - 1) * 50;

  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";
  const { personas, total, limit } = await getPersonas(tenant, search, soloMora, offset);
  const totalPages = Math.ceil(total / limit);

  function buildUrl(extra: Record<string, string | null>) {
    const sp = new URLSearchParams();
    sp.set("t", tenant);
    if (search && !("q" in extra)) sp.set("q", search);
    if (soloMora && !("mora" in extra)) sp.set("mora", "1");
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    return `/personas?${sp.toString()}`;
  }

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Personas</h1>
            <p className="text-slate-500 mt-1">
              {tenantNombre} â€” {total.toLocaleString("es-AR")} persona{total === 1 ? "" : "s"}
              {(search || soloMora) && " (filtradas)"}
            </p>
          </div>
          <Link
            href={`/personas/nuevo?t=${tenant}`}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
          >
            <Plus size={16} />
            Nueva Persona
          </Link>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <form className="space-y-3">
            <input type="hidden" name="t" value={tenant} />
            <div className="relative">
              <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                name="q"
                defaultValue={search}
                placeholder="Buscar por nombre, apellido, razÃ³n social, CUIT o DNI..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 border border-red-200 rounded-lg bg-red-50/50">
                <input
                  type="checkbox"
                  name="mora"
                  id="mora"
                  value="1"
                  defaultChecked={soloMora}
                  className="rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <label htmlFor="mora" className="text-sm font-medium text-red-700 cursor-pointer flex items-center gap-1">
                  <AlertCircle size={14} />
                  Solo con mora
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
                >
                  Aplicar filtros
                </button>
                {(search || soloMora) && (
                  <Link
                    href={`/personas?t=${tenant}`}
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
                    Apellido y Nombre / RazÃ³n Social
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Documento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Ventas
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    AcciÃ³n
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {personas.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50 transition ${p.activo === false ? "opacity-50" : ""} ${p.tiene_mora ? "bg-red-50/30" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/personas/${p.id}?t=${tenant}`}
                        className="block"
                      >
                        <div className="font-medium text-slate-900">
                          {p.razon_social ||
                            `${p.apellido || ""}, ${p.nombre || ""}`.trim().replace(/^,\s*|,\s*$/g, "") ||
                            "â€”"}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          p.tipo === "JURIDICA"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {p.tipo === "JURIDICA" ? "JurÃ­dica" : "FÃ­sica"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-700">
                        {p.cuit || p.doc_numero || "â€”"}
                      </div>
                      <div className="text-xs text-slate-500">{p.doc_tipo}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="text-slate-700">{p.telefono || "â€”"}</div>
                      {p.email && (
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">
                          {p.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.activo === false ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600">
                          Inactiva
                        </span>
                      ) : p.tiene_mora ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                          <AlertCircle size={12} />
                          Con mora
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">â€”</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.ventas_count > 0 ? (
                        <span className="inline-block px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-medium">
                          {p.ventas_count}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">â€”</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PersonaAcciones
                        tenant={tenant}
                        personaId={p.id}
                        activo={p.activo !== false}
                        ventasCount={Number(p.ventas_count) || 0}
                        nombre={p.razon_social || `${p.apellido || ""}, ${p.nombre || ""}`.trim().replace(/^,\s*|,\s*$/g, "") || "â€”"}
                      />
                    </td>
                  </tr>
                ))}
                {personas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No se encontraron personas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PaginaciÃ³n */}
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
