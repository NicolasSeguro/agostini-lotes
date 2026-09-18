import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS, loadTenants } from "@/lib/db";
import Link from "next/link";
import { Search, AlertCircle, Plus } from "lucide-react";
import { PersonaAcciones } from "@/components/PersonaAcciones";
import { PageHeader, opsOutlineBtn, opsPanel, opsPrimaryBtn } from "@/components/ops-ui";

export const dynamic = "force-dynamic";

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

  const tenants = await loadTenants();
  const tenantNombre =
    tenants.find((t) => t.slug === tenant)?.nombre ||
    TENANTS.find((t) => t.slug === tenant)?.nombre ||
    tenant;
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
      <div className="p-6 md:p-10 max-w-7xl">
        <PageHeader
          kicker={tenantNombre}
          title="Personas"
          description={`${total.toLocaleString("es-AR")} persona${total === 1 ? "" : "s"}${(search || soloMora) ? " (filtradas)" : ""}`}
          actions={
            <>
              <Link href="/personas/maestro" className={opsOutlineBtn}>
                Maestro / duplicados
              </Link>
              <Link href={`/personas/nuevo?t=${tenant}`} className={opsPrimaryBtn}>
                <Plus size={16} />
                Nueva persona
              </Link>
            </>
          }
        />

        <div className={opsPanel}>
          <form className="space-y-3">
            <input type="hidden" name="t" value={tenant} />
            <div className="relative">
              <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                name="q"
                defaultValue={search}
                placeholder="Buscar por nombre, apellido, razón social, CUIT o DNI..."
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

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {personas.map((p) => {
            const nombre =
              p.razon_social ||
              `${p.apellido || ""}, ${p.nombre || ""}`.trim().replace(/^,\s*|,\s*$/g, "") ||
              "—";
            const initials = nombre
              .replace(/,/g, " ")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((w: string) => w[0])
              .join("")
              .toUpperCase();
            return (
              <div
                key={p.id}
                className={`rounded-3xl border border-stone-200/80 bg-white/80 p-5 ${
                  p.activo === false ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <Link
                    href={`/personas/${p.id}?t=${tenant}`}
                    className="w-11 h-11 rounded-full bg-ink text-cream-50 text-xs flex items-center justify-center shrink-0"
                  >
                    {initials}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/personas/${p.id}?t=${tenant}`} className="block">
                      <div className="font-medium text-ink truncate">{nombre}</div>
                    </Link>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {p.cuit || p.doc_numero || "Sin documento"}
                    </div>
                    <div className="text-xs text-stone-500">{p.telefono || p.email || "Sin contacto"}</div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {p.tiene_mora ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                          Con mora
                        </span>
                      ) : null}
                      {p.ventas_count > 0 ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-cream-100 text-stone-700">
                          {p.ventas_count} venta{p.ventas_count === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <PersonaAcciones
                    tenant={tenant}
                    personaId={p.id}
                    activo={p.activo !== false}
                    ventasCount={Number(p.ventas_count) || 0}
                    nombre={nombre}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {personas.length === 0 && (
          <div className="rounded-3xl border border-stone-200/80 bg-white/80 p-10 text-center text-stone-500">
            No se encontraron personas
          </div>
        )}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm text-stone-600">
            <div>
              Página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={buildUrl({ page: String(page - 1) })}
                  className="px-3 py-1.5 border border-stone-200 rounded-xl hover:bg-white"
                >
                  Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildUrl({ page: String(page + 1) })}
                  className="px-3 py-1.5 border border-stone-200 rounded-xl hover:bg-white"
                >
                  Siguiente
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
