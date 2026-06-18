import { AppShell } from "@/components/AppShell";
import { query } from "@/lib/db";
import Link from "next/link";
import { Plus, Search, Handshake } from "lucide-react";
import { ConveniosLista } from "./ConveniosLista";

export const dynamic = "force-dynamic";

async function getConvenios(activo: string | null, q: string) {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (activo === "true") conditions.push("c.activo = true");
  else if (activo === "false") conditions.push("c.activo = false");

  if (q.length > 0) {
    conditions.push(`(c.razon_social ILIKE $${idx} OR c.cuit ILIKE $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return await query(
    `
    SELECT 
      c.id, c.razon_social, c.cuit, 
      TO_CHAR(c.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
      TO_CHAR(c.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
      c.tipo_beneficio::text AS tipo_beneficio, c.valor_beneficio,
      c.tenants_aplicables, c.activo,
      COALESCE((SELECT COUNT(*) FROM tenant_jacaranda.ventas WHERE convenio_id = c.id), 0) +
      COALESCE((SELECT COUNT(*) FROM tenant_tipuana.ventas WHERE convenio_id = c.id), 0) +
      COALESCE((SELECT COUNT(*) FROM tenant_alisos.ventas WHERE convenio_id = c.id), 0) +
      COALESCE((SELECT COUNT(*) FROM tenant_boulevard.ventas WHERE convenio_id = c.id), 0) AS ventas_count,
      CASE 
        WHEN c.activo = false THEN 'INACTIVO'
        WHEN CURRENT_DATE < c.fecha_inicio THEN 'PROXIMO'
        WHEN CURRENT_DATE > c.fecha_fin THEN 'VENCIDO'
        ELSE 'VIGENTE'
      END AS situacion
    FROM shared.convenios c
    ${where}
    ORDER BY c.razon_social ASC, c.fecha_inicio DESC
    `,
    params
  );
}

export default async function ConveniosPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; activo?: string; q?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const activoFilter = params.activo || null;
  const q = (params.q || "").trim();

  const convenios = await getConvenios(activoFilter, q);

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Handshake className="text-brand-600" size={28} />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Convenios</h1>
              <p className="text-slate-500 mt-1">
                Acuerdos con entidades que dan beneficio en el precio de venta Â· {(convenios as any[]).length} convenio{(convenios as any[]).length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <Link
            href={`/convenios/nuevo?t=${tenant}`}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Plus size={16} />
            Nuevo Convenio
          </Link>
        </div>

        {/* Filtros */}
        <form className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex gap-3 flex-wrap items-end">
          <input type="hidden" name="t" value={tenant} />
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-slate-600 mb-1 block">Buscar (razÃ³n social o CUIT)</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="UTA, Banco Macro..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Estado</label>
            <select
              name="activo"
              defaultValue={activoFilter || ""}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-sm rounded-lg"
          >
            Filtrar
          </button>
        </form>

        {(convenios as any[]).length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <div className="text-slate-500">No hay convenios cargados.</div>
            <Link
              href={`/convenios/nuevo?t=${tenant}`}
              className="inline-block mt-3 text-brand-600 hover:text-brand-700 text-sm font-medium"
            >
              Crear el primero
            </Link>
          </div>
        ) : (
          <ConveniosLista tenant={tenant} convenios={convenios as any[]} />
        )}
      </div>
    </AppShell>
  );
}
