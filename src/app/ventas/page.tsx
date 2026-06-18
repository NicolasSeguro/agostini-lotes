import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { formatMoney, formatNumber, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Search, AlertCircle, Plus, AlertTriangle } from "lucide-react";
import { BarraPendientes } from "@/components/BarraPendientes";
import { AsignarIndiceButton } from "@/components/AsignarIndiceButton";

async function getProyectos(tenantSlug: string) {
  const schema = getSchema(tenantSlug);
  return await query(`
    SELECT id, nombre,
      (SELECT COUNT(*) FROM ${schema}.ventas v 
       JOIN ${schema}.lotes l ON l.id = v.lote_id 
       WHERE l.proyecto_id = p.id)::int AS cant_ventas
    FROM ${schema}.proyectos p
    WHERE p.tipo_proyecto != 'HISTORICO' OR p.tipo_proyecto IS NULL
    ORDER BY p.nombre
  `);
}

async function getVentas(
  tenantSlug: string,
  proyectoId: string | null,
  estado: string | null,
  ajuste: string | null,
  search: string,
  soloMora: boolean,
  indiceFalta: boolean,
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
    const estados = estado.split(",").map(s => s.trim()).filter(Boolean);
    if (estados.length === 1) {
      conditions.push(`v.estado::text = $${idx++}`);
      params.push(estados[0]);
    } else if (estados.length > 1) {
      const placeholders = estados.map(() => `$${idx++}`).join(",");
      conditions.push(`v.estado::text IN (${placeholders})`);
      params.push(...estados);
    }
  }
  if (ajuste) {
    conditions.push(`v.indice_ajuste::text = $${idx++}`);
    params.push(ajuste);
  }
  if (indiceFalta) {
    conditions.push(`v.sistema_amort::text = 'FIJO_SIN_INTERES' AND (v.indice_ajuste::text = 'NINGUNO' OR v.indice_ajuste IS NULL)`);
    conditions.push(`v.estado::text NOT IN ('ANULADA','RECHAZADA_AUTORIZACION','RECHAZADA_CONTABILIDAD')`);
  }
  if (search) {
    conditions.push(`(
      UPPER(COALESCE(l.numero,'')) LIKE UPPER($${idx}) OR
      UPPER(COALESCE(per.apellido,'')) LIKE UPPER($${idx}) OR
      UPPER(COALESCE(per.nombre,'')) LIKE UPPER($${idx}) OR
      UPPER(COALESCE(per.razon_social,'')) LIKE UPPER($${idx}) OR
      REPLACE(COALESCE(per.cuit,''), '-', '') LIKE REPLACE($${idx}, '-', '')
    )`);
    params.push(`%${search}%`);
    idx++;
  }
  if (soloMora) {
    conditions.push(`EXISTS (
      SELECT 1 FROM ${schema}.cuotas c 
      WHERE c.venta_id = v.id 
        AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') 
        AND c.fecha_vto < CURRENT_DATE
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(LIMIT, offset);

  const ventas = await query(`
    SELECT 
      v.id, v.fecha, v.estado, v.precio_total, v.cuota_base,
      v.cant_cuotas, v.indice_ajuste, v.sistema_amort,
      v.requiere_aut_desc_fin,
      l.numero AS lote_numero,
      p.nombre AS proyecto_nombre,
      titulares_data.titulares_completo AS comprador,
      titulares_data.primer_persona_id AS persona_id,
      titulares_data.primer_cuit AS cuit,
      titulares_data.cant_titulares,
      (SELECT COUNT(*)::int FROM ${schema}.cuotas c 
       WHERE c.venta_id = v.id AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')) AS cuotas_pendientes,
      (SELECT COUNT(*)::int FROM ${schema}.cuotas c 
       WHERE c.venta_id = v.id AND c.estado = 'PAGA') AS cuotas_pagas,
      (SELECT COUNT(*)::int FROM ${schema}.cuotas c 
       WHERE c.venta_id = v.id AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') 
         AND c.fecha_vto < CURRENT_DATE) AS cuotas_vencidas
    FROM ${schema}.ventas v
    JOIN ${schema}.lotes l ON l.id = v.lote_id
    JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
    LEFT JOIN LATERAL (
      SELECT
        STRING_AGG(
          COALESCE(per.razon_social,
            TRIM(BOTH ', ' FROM COALESCE(per.apellido,'') || ', ' || COALESCE(per.nombre,''))
          ),
          ' / ' ORDER BY vt.orden
        ) AS titulares_completo,
        (ARRAY_AGG(per.id ORDER BY vt.orden))[1] AS primer_persona_id,
        (ARRAY_AGG(per.cuit ORDER BY vt.orden))[1] AS primer_cuit,
        COUNT(*)::int AS cant_titulares
      FROM ${schema}.venta_titulares vt
      JOIN ${schema}.personas per ON per.id = vt.persona_id
      WHERE vt.venta_id = v.id
    ) titulares_data ON TRUE
    LEFT JOIN ${schema}.venta_titulares vt_search ON vt_search.venta_id = v.id
    LEFT JOIN ${schema}.personas per ON per.id = vt_search.persona_id
    ${whereClause}
    GROUP BY v.id, v.fecha, v.estado, v.precio_total, v.cuota_base,
             v.cant_cuotas, v.indice_ajuste, v.sistema_amort, v.requiere_aut_desc_fin,
             l.numero, p.nombre,
             titulares_data.titulares_completo, titulares_data.primer_persona_id,
             titulares_data.primer_cuit, titulares_data.cant_titulares
    ORDER BY v.fecha DESC
    LIMIT $${idx++} OFFSET $${idx}
  `, params);

  const countParams = params.slice(0, -2);
  const totalRes = await query(`
    SELECT COUNT(DISTINCT v.id)::int AS total 
    FROM ${schema}.ventas v
    JOIN ${schema}.lotes l ON l.id = v.lote_id
    JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
    LEFT JOIN ${schema}.venta_titulares vt_search ON vt_search.venta_id = v.id
    LEFT JOIN ${schema}.personas per ON per.id = vt_search.persona_id
    ${whereClause}
  `, countParams);

  return { ventas: ventas as any[], total: totalRes[0].total, limit: LIMIT };
}

const ESTADOS = [
  { value: "EN_CARGA", label: "En carga", color: "bg-slate-100 text-slate-700" },
  { value: "CERRADA_PENDIENTE", label: "Cerrada pendiente", color: "bg-blue-100 text-blue-700" },
  { value: "CERRADA_CONFIRMADA", label: "Cerrada confirmada", color: "bg-cyan-100 text-cyan-700" },
  { value: "AUTORIZADA", label: "Autorizada", color: "bg-amber-100 text-amber-700" },
  { value: "CONTABILIZADA", label: "Contabilizada", color: "bg-green-100 text-green-700" },
  { value: "RECHAZADA_COMERCIAL", label: "Rech. comercial", color: "bg-red-100 text-red-700" },
  { value: "RECHAZADA_CONTABILIDAD", label: "Rech. contabilidad", color: "bg-red-100 text-red-700" },
  { value: "ANULADA", label: "Anulada", color: "bg-slate-100 text-slate-500" },
];

async function getAjustesUsados(tenantSlug: string): Promise<string[]> {
  const schema = getSchema(tenantSlug);
  const rows = await query<{ indice_ajuste: string }>(`
    SELECT DISTINCT indice_ajuste::text AS indice_ajuste
    FROM ${schema}.ventas
    WHERE indice_ajuste IS NOT NULL
    ORDER BY indice_ajuste
  `);
  return rows.map((r) => r.indice_ajuste);
}

async function getVentasSinIndiceProblematicas(tenantSlug: string): Promise<number> {
  const schema = getSchema(tenantSlug);
  const rows = await query<{ cant: string }>(`
    SELECT COUNT(*)::text AS cant
    FROM ${schema}.ventas
    WHERE sistema_amort::text = 'FIJO_SIN_INTERES'
      AND (indice_ajuste::text = 'NINGUNO' OR indice_ajuste IS NULL)
      AND estado::text NOT IN ('ANULADA', 'RECHAZADA_AUTORIZACION', 'RECHAZADA_CONTABILIDAD')
  `);
  return parseInt(rows[0]?.cant || "0");
}

function getEstadoStyle(estado: string) {
  return ESTADOS.find((e) => e.value === estado) || { label: estado, color: "bg-slate-100 text-slate-700" };
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; proy?: string; estado?: string; ajuste?: string; q?: string; mora?: string; indice_falta?: string; page?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const proyectoId = params.proy || null;
  const estado = params.estado || null;
  const ajuste = params.ajuste || null;
  const search = params.q || "";
  const soloMora = params.mora === "1";
  const indiceFalta = params.indice_falta === "1";
  const page = parseInt(params.page || "1");
  const offset = (page - 1) * 50;

  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  const [proyectos, ajustesUsados, sinIndiceCount, { ventas, total, limit }] = await Promise.all([
    getProyectos(tenant),
    getAjustesUsados(tenant),
    getVentasSinIndiceProblematicas(tenant),
    getVentas(tenant, proyectoId, estado, ajuste, search, soloMora, indiceFalta, offset),
  ]);

  const totalPages = Math.ceil(total / limit);

  function buildUrl(extra: Record<string, string | null>) {
    const sp = new URLSearchParams();
    sp.set("t", tenant);
    if (proyectoId && !("proy" in extra)) sp.set("proy", proyectoId);
    if (estado && !("estado" in extra)) sp.set("estado", estado);
    if (ajuste && !("ajuste" in extra)) sp.set("ajuste", ajuste);
    if (search && !("q" in extra)) sp.set("q", search);
    if (soloMora && !("mora" in extra)) sp.set("mora", "1");
    if (indiceFalta && !("indice_falta" in extra)) sp.set("indice_falta", "1");
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    return `/ventas?${sp.toString()}`;
  }

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Ventas</h1>
            <p className="text-slate-500 mt-1">
              {tenantNombre} Ã¢â‚¬â€ {formatNumber(total)} venta{total === 1 ? "" : "s"}
              {(proyectoId || estado || ajuste || search || soloMora || indiceFalta) && " (filtradas)"}
            </p>
          </div>
          <Link
            href={`/ventas/nueva?t=${tenant}`}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition flex-shrink-0"
          >
            <Plus size={16} />
            Nueva Venta
          </Link>
        </div>

        {/* Barra de pendientes en el workflow */}
        <BarraPendientes tenant={tenant} />

        {/* Banner: ventas AJUSTABLES sin indice asignado (probable error de carga) */}
        {sinIndiceCount > 0 && !indiceFalta && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-amber-900">
                  {sinIndiceCount} venta{sinIndiceCount === 1 ? "" : "s"} AJUSTABLE{sinIndiceCount === 1 ? "" : "S"} sin indice de ajuste asignado
                </div>
                <div className="text-sm text-amber-800 mt-0.5">
                  Estas ventas no se ajustan automaticamente. Probable error de carga.
                </div>
              </div>
            </div>
            <Link
              href={buildUrl({ indice_falta: "1", proy: null, estado: null, ajuste: null, mora: null })}
              className="text-sm font-medium text-amber-900 hover:text-amber-700 bg-white border border-amber-300 rounded-lg px-3 py-1.5 transition whitespace-nowrap"
            >
              Ver listado
            </Link>
          </div>
        )}

        {/* Barra de retorno cuando se esta viendo el listado filtrado por indice_falta */}
        {indiceFalta && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
              <div className="text-sm text-amber-900">
                Viendo solo ventas AJUSTABLES sin indice asignado. Revisa y corregi cada una.
              </div>
            </div>
            <Link
              href={`/ventas?t=${tenant}`}
              className="text-sm text-amber-900 hover:text-amber-700 underline whitespace-nowrap"
            >
              Salir del filtro
            </Link>
          </div>
        )}

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
                placeholder="Buscar por lote, comprador, CUIT..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div className="flex flex-wrap gap-3 items-end">
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
                      {p.nombre} ({p.cant_ventas})
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

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ajuste</label>
                <select
                  name="ajuste"
                  defaultValue={ajuste || ""}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Todos los ajustes</option>
                  {ajustesUsados.map((a) => (
                    <option key={a} value={a}>
                      {a === "NINGUNO" ? "Sin ajuste" : a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 self-end pb-1 px-3 py-1.5 border border-red-200 rounded-lg bg-red-50/50">
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

              <div className="flex gap-2 self-end">
                <button
                  type="submit"
                  className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
                >
                  Aplicar filtros
                </button>
                {(proyectoId || estado || ajuste || search || soloMora) && (
                  <Link
                    href={`/ventas?t=${tenant}`}
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
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Lote / Proyecto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Comprador
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Cuotas
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Mora
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Ajuste
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Cuota actual
                  </th>
                  {indiceFalta && (
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Accion
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ventas.map((v) => {
                  const estStyle = getEstadoStyle(v.estado);
                  const tieneMora = v.cuotas_vencidas > 0;
                  return (
                    <tr 
                      key={v.id} 
                      className={`hover:bg-slate-50 transition cursor-pointer ${tieneMora ? "bg-red-50/30" : ""}`}
                    >
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <Link href={`/ventas/${v.id}?t=${tenant}`} className="block">
                          {formatDate(v.fecha)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/ventas/${v.id}?t=${tenant}`} className="block">
                          <div className="font-medium text-slate-900">
                            Lote {v.lote_numero}
                          </div>
                          <div className="text-xs text-slate-500">{v.proyecto_nombre}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Link href={`/personas/${v.persona_id}?t=${tenant}`} className="text-slate-900 hover:text-brand-700 block max-w-[260px]">
                          <div className="line-clamp-2 leading-tight">
                            {v.comprador || "Ã¢â‚¬â€"}
                          </div>
                          {v.cant_titulares > 1 && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {v.cant_titulares} titulares
                            </div>
                          )}
                        </Link>
                        {v.cuit && v.cant_titulares === 1 && (
                          <div className="text-xs text-slate-500">{v.cuit}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium w-fit ${estStyle.color}`}>
                            {estStyle.label}
                          </span>
                          {v.requiere_aut_desc_fin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 w-fit" title="Descuento financiero excede tope">
                              <AlertTriangle size={10} />
                              Req. auth
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-slate-700">
                        <div className="font-medium">{v.cuotas_pagas} / {v.cant_cuotas}</div>
                        <div className="text-xs text-slate-500">
                          {v.cuotas_pendientes} pend.
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {tieneMora ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                            <AlertCircle size={12} />
                            {v.cuotas_vencidas}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">Ã¢â‚¬â€</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {v.indice_ajuste === "NINGUNO" ? (
                          <span className="text-slate-400">Ã¢â‚¬â€</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                            {v.indice_ajuste}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                        {formatMoney(v.cuota_base)}
                      </td>
                      {indiceFalta && (
                        <td className="px-4 py-3 text-center">
                          <AsignarIndiceButton
                            ventaId={v.id}
                            tenant={tenant}
                            ventaLabel={`${v.lote_numero} - ${v.proyecto_nombre}`}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
                {ventas.length === 0 && (
                  <tr>
                    <td colSpan={indiceFalta ? 9 : 8} className="px-4 py-8 text-center text-slate-500">
                      No se encontraron ventas con esos filtros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                PÃƒÂ¡gina {page} de {totalPages}
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
