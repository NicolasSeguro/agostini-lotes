import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { formatMoney, formatNumber, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Search, AlertCircle, Plus } from "lucide-react";

function getDefaultRange(): { desde: string; hasta: string } {
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  return {
    desde: desde.toISOString().split("T")[0],
    hasta: hoy.toISOString().split("T")[0],
  };
}

async function getMediosCobro() {
  return await query(`
    SELECT id, codigo, nombre, tipo
    FROM shared.medios_cobro
    WHERE habilitado = true
    ORDER BY orden
  `);
}

async function getCobranzas(
  tenantSlug: string,
  desde: string,
  hasta: string,
  medioId: string | null,
  search: string,
  soloHuerfanas: boolean,
  offset: number
) {
  const schema = getSchema(tenantSlug);
  const LIMIT = 50;

  const conditions: string[] = [
    `c.fecha >= $1::date`,
    `c.fecha <= $2::date`,
  ];
  const params: any[] = [desde, hasta];
  let idx = 3;

  if (medioId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM ${schema}.cobranza_medios cm 
      WHERE cm.cobranza_id = c.id AND cm.medio_cobro_id = $${idx}::uuid
    )`);
    params.push(medioId);
    idx++;
  }
  if (search) {
    conditions.push(`(
      CAST(c.nro_recibo AS TEXT) LIKE $${idx} OR
      UPPER(COALESCE(per.apellido,'')) LIKE UPPER($${idx}) OR
      UPPER(COALESCE(per.nombre,'')) LIKE UPPER($${idx}) OR
      UPPER(COALESCE(per.razon_social,'')) LIKE UPPER($${idx}) OR
      REPLACE(COALESCE(per.cuit,''), '-', '') LIKE REPLACE($${idx}, '-', '')
    )`);
    params.push(`%${search}%`);
    idx++;
  }
  if (soloHuerfanas) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM ${schema}.cobranza_imputaciones ci WHERE ci.cobranza_id = c.id
    )`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  params.push(LIMIT, offset);

  const cobranzas = await query(`
    SELECT 
      c.id, c.nro_recibo, c.fecha, c.monto_total, c.estado, c.legacy_id,
      per.id AS persona_id,
      COALESCE(per.razon_social,
        TRIM(BOTH ', ' FROM COALESCE(per.apellido,'') || ', ' || COALESCE(per.nombre,''))
      ) AS comprador,
      per.cuit,
      (SELECT STRING_AGG(mc.codigo, ', ' ORDER BY cm.orden)
       FROM ${schema}.cobranza_medios cm
       JOIN shared.medios_cobro mc ON mc.id = cm.medio_cobro_id
       WHERE cm.cobranza_id = c.id) AS medios_codigos,
      (SELECT COUNT(*) FROM ${schema}.cobranza_imputaciones ci 
       WHERE ci.cobranza_id = c.id)::int AS imputaciones_count
    FROM ${schema}.cobranzas c
    LEFT JOIN ${schema}.personas per ON per.id = c.persona_id
    ${whereClause}
    ORDER BY c.fecha DESC, c.nro_recibo DESC
    LIMIT $${idx++} OFFSET $${idx}
  `, params);

  const countParams = params.slice(0, -2);
  const totalRes = await query(`
    SELECT 
      COUNT(*)::int AS total,
      COALESCE(ROUND(SUM(c.monto_total)::numeric, 2), 0) AS monto_total
    FROM ${schema}.cobranzas c
    LEFT JOIN ${schema}.personas per ON per.id = c.persona_id
    ${whereClause}
  `, countParams);

  return {
    cobranzas: cobranzas as any[],
    total: totalRes[0].total,
    montoTotal: totalRes[0].monto_total,
    limit: LIMIT,
  };
}

export default async function CobranzasPage({
  searchParams,
}: {
  searchParams: Promise<{
    t?: string;
    desde?: string;
    hasta?: string;
    medio?: string;
    q?: string;
    huerf?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const defaultRange = getDefaultRange();
  const desde = params.desde || defaultRange.desde;
  const hasta = params.hasta || defaultRange.hasta;
  const medioId = params.medio || null;
  const search = params.q || "";
  const soloHuerfanas = params.huerf === "1";
  const page = parseInt(params.page || "1");
  const offset = (page - 1) * 50;

  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  const [medios, { cobranzas, total, montoTotal, limit }] = await Promise.all([
    getMediosCobro(),
    getCobranzas(tenant, desde, hasta, medioId, search, soloHuerfanas, offset),
  ]);

  const totalPages = Math.ceil(total / limit);
  const promedio = total > 0 ? parseFloat(montoTotal) / total : 0;

  function buildUrl(extra: Record<string, string | null>) {
    const sp = new URLSearchParams();
    sp.set("t", tenant);
    sp.set("desde", desde);
    sp.set("hasta", hasta);
    if (medioId && !("medio" in extra)) sp.set("medio", medioId);
    if (search && !("q" in extra)) sp.set("q", search);
    if (soloHuerfanas && !("huerf" in extra)) sp.set("huerf", "1");
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    return `/cobranzas?${sp.toString()}`;
  }

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Cobranzas</h1>
            <p className="text-slate-500 mt-1">
              {tenantNombre} — del {formatDate(desde)} al {formatDate(hasta)}
            </p>
          </div>
          <Link
            href={`/cobranzas/nueva?t=${tenant}`}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm"
          >
            <Plus size={18} />
            Nueva Cobranza
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
                placeholder="Buscar por nro de recibo, cliente o CUIT..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Desde</label>
                <input
                  type="date"
                  name="desde"
                  defaultValue={desde}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Hasta</label>
                <input
                  type="date"
                  name="hasta"
                  defaultValue={hasta}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Medio</label>
                <select
                  name="medio"
                  defaultValue={medioId || ""}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Todos</option>
                  {medios.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 self-end px-3 py-1.5 border border-amber-200 rounded-lg bg-amber-50/50">
                <input
                  type="checkbox"
                  name="huerf"
                  id="huerf"
                  value="1"
                  defaultChecked={soloHuerfanas}
                  className="rounded border-amber-300 text-amber-600"
                />
                <label htmlFor="huerf" className="text-sm font-medium text-amber-700 cursor-pointer flex items-center gap-1">
                  <AlertCircle size={14} />
                  Solo huérfanas
                </label>
              </div>
              <div className="flex gap-2 self-end">
                <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg">
                  Aplicar
                </button>
                <Link href={`/cobranzas?t=${tenant}`} className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-300 rounded-lg">
                  Reset
                </Link>
              </div>
            </div>
          </form>
        </div>

        {/* Totalizadores */}
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-brand-200 p-4 mb-6">
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-slate-600">Cobranzas filtradas</div>
              <div className="text-xl font-bold text-slate-900">{formatNumber(total)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600">Monto total</div>
              <div className="text-xl font-bold text-brand-700">{formatMoney(montoTotal)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600">Promedio</div>
              <div className="text-xl font-bold text-slate-900">{formatMoney(promedio)}</div>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Recibo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Medio(s)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cobranzas.map((c) => (
                  <tr key={c.id} className={`hover:bg-slate-50 transition cursor-pointer ${
                    c.estado === "ANULADA" ? "bg-red-50/30 line-through" :
                    c.imputaciones_count === 0 ? "bg-amber-50/20" : ""
                  }`}>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/cobranzas/${c.id}?t=${tenant}`} className="block text-slate-700">
                        {formatDate(c.fecha)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/cobranzas/${c.id}?t=${tenant}`} className="block font-medium text-slate-900">
                        {c.nro_recibo || <span className="text-slate-400">—</span>}
                        {!c.legacy_id && (
                          <span className="ml-1 inline-block px-1 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded">ERP</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {c.persona_id ? (
                        <Link href={`/personas/${c.persona_id}?t=${tenant}`} className="text-slate-900 hover:text-brand-700 line-clamp-1 max-w-[200px]">
                          {c.comprador || "—"}
                        </Link>
                      ) : (<span className="text-slate-400">Sin cliente</span>)}
                      {c.cuit && (<div className="text-xs text-slate-500">{c.cuit}</div>)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.medios_codigos ? (
                        c.medios_codigos.split(", ").map((codigo: string, i: number) => (
                          <span key={i} className="inline-block mr-1 mb-0.5 px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">
                            {codigo}
                          </span>
                        ))
                      ) : (<span className="text-slate-400">—</span>)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {c.estado === "ANULADA" ? (
                        <span className="px-2 py-0.5 rounded font-medium bg-red-100 text-red-700">Anulada</span>
                      ) : c.imputaciones_count === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-700">
                          <AlertCircle size={12} />
                          Huérfana
                        </span>
                      ) : (
                        <span className="text-slate-700">{c.imputaciones_count}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                      {formatMoney(c.monto_total)}
                    </td>
                  </tr>
                ))}
                {cobranzas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No se encontraron cobranzas con esos filtros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                Página {page} de {formatNumber(totalPages)}
              </div>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={buildUrl({ page: String(page - 1) })} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white">
                    Anterior
                  </Link>
                )}
                {page < totalPages && (
                  <Link href={buildUrl({ page: String(page + 1) })} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white">
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
