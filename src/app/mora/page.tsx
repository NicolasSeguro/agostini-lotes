import { AppShell } from "@/components/AppShell";
import { query, getSchema, loadTenants, TENANTS } from "@/lib/db";
import { calcularScoreMora, estadioMora } from "@/lib/mora-score";
import { formatMoney, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ops-ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

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
      <div className="p-6 md:p-10 max-w-5xl">
        <PageHeader
          kicker={tenantNombre}
          title="Atrasos"
          description="A quién llamar primero. El número grande es la prioridad (misma lógica que CuotaFácil)."
        />
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 mb-4">
            {error}
          </div>
        )}
        {scored.length === 0 && !error && (
          <div className="rounded-3xl border border-stone-200/80 bg-white/80 p-10 text-center text-stone-500">
            Nadie está en mora en este fideicomiso.
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {scored.map((row, i) => (
            <Link
              key={row.venta_id}
              href={`/ventas/${row.venta_id}?t=${tenant}`}
              className="rounded-3xl border border-stone-200/80 bg-white/80 p-5 flex gap-4 hover:border-stone-300"
            >
              <div className="w-12 h-12 rounded-full bg-ink text-cream-50 text-sm flex items-center justify-center shrink-0">
                {iniciales(row.cliente)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-ink">{row.cliente}</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      Venta #{row.nro ?? "—"} · {row.cuotas_vencidas} cuotas · {row.dias_max} días
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-serif text-2xl text-ink leading-none">{row.score}</div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">
                      {i === 0 ? "Primero" : `E${row.estadio}`}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-sm text-ink">{formatMoney(row.saldo)}</div>
              </div>
            </Link>
          ))}
        </div>
        <p className="text-xs text-stone-400 mt-6">
          Actualizado {formatDate(new Date())}. Tocá una tarjeta para abrir la venta.
        </p>
      </div>
    </AppShell>
  );
}
