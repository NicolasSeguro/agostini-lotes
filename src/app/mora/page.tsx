import { AppShell } from "@/components/AppShell";
import { query, getSchema, loadTenants, TENANTS } from "@/lib/db";
import { calcularScoreMora, estadioMora } from "@/lib/mora-score";
import { formatMoney, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PageHeader, opsTableWrap } from "@/components/ops-ui";

export const dynamic = "force-dynamic";

async function getCarteraMora(tenant: string) {
  const schema = getSchema(tenant);
  return query<{
    venta_id: string;
    nro: number | null;
    cliente: string;
    cuotas_vencidas: number;
    dias_max: number;
    saldo: number;
  }>(
    `
    SELECT
      v.id AS venta_id,
      v.nro,
      COALESCE(per.razon_social, TRIM(CONCAT(per.apellido, ' ', per.nombre))) AS cliente,
      COUNT(*) FILTER (
        WHERE c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE
      )::int AS cuotas_vencidas,
      COALESCE(MAX(CURRENT_DATE - c.fecha_vto) FILTER (
        WHERE c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE
      ), 0)::int AS dias_max,
      COALESCE(SUM(v.cuota_base) FILTER (
        WHERE c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE
      ), 0)::numeric AS saldo
    FROM ${schema}.ventas v
    JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id AND vt.orden = 1
    JOIN ${schema}.personas per ON per.id = vt.persona_id
    JOIN ${schema}.cuotas c ON c.venta_id = v.id
    WHERE v.estado::text NOT IN ('ANULADA')
    GROUP BY v.id, v.nro, per.razon_social, per.apellido, per.nombre
    HAVING COUNT(*) FILTER (
      WHERE c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL') AND c.fecha_vto < CURRENT_DATE
    ) > 0
    ORDER BY cuotas_vencidas DESC, dias_max DESC
    LIMIT 200
    `
  );
}

export default async function MoraPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const tenants = await loadTenants();
  const tenantNombre =
    tenants.find((t) => t.slug === tenant)?.nombre ||
    TENANTS.find((t) => t.slug === tenant)?.nombre ||
    tenant;

  let filas: Awaited<ReturnType<typeof getCarteraMora>> = [];
  let error: string | null = null;
  try {
    filas = await getCarteraMora(tenant);
  } catch (err: any) {
    error = err.message || "No se pudo leer la cartera de mora";
  }

  const scored = filas
    .map((row) => ({
      ...row,
      estadio: estadioMora(row.cuotas_vencidas),
      score: calcularScoreMora({
        cuotasVencidas: row.cuotas_vencidas,
        historialMora: Math.min(1, row.cuotas_vencidas / 6),
        diasVencidoMasAntiguo: row.dias_max,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-6xl">
        <PageHeader
          kicker={tenantNombre}
          title="Mora"
          description="Priorización de gestiones. El score replica la heurística de CuotaFacil sobre cuotas reales de Postgres."
        />
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 mb-4">
            {error}
          </div>
        )}
        <div className={`${opsTableWrap} overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead className="bg-cream-50 text-left text-stone-500">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Venta</th>
                <th className="px-4 py-3">Estadio</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Dias</th>
                <th className="px-4 py-3">Saldo est.</th>
              </tr>
            </thead>
            <tbody>
              {scored.map((row) => (
                <tr key={row.venta_id} className="border-t border-stone-100">
                  <td className="px-4 py-3 font-medium text-stone-800">{row.cliente}</td>
                  <td className="px-4 py-3">#{row.nro ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.estadio >= 4 ? "danger" : row.estadio >= 2 ? "warning" : "info"}>
                      E{row.estadio}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-semibold">{row.score}</td>
                  <td className="px-4 py-3">{row.dias_max}</td>
                  <td className="px-4 py-3">{formatMoney(row.saldo)}</td>
                </tr>
              ))}
              {!error && scored.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-stone-500" colSpan={6}>
                    No hay cuotas vencidas en este fideicomiso.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-400 mt-4">
          Actualizado {formatDate(new Date())}. Gestiones y promesas de pago se
          guardan en mora_gestiones cuando exista la migracion aplicada.
        </p>
      </div>
    </AppShell>
  );
}
