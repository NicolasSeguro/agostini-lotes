import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, ClipboardList } from "lucide-react";
import { ReintegrosLista } from "./ReintegrosLista";

export const dynamic = "force-dynamic";

async function getReintegrosPendientes(tenantSlug: string) {
  const schema = getSchema(tenantSlug);

  // Ventas en PENDIENTE_REINTEGRO con info del cliente y monto a reintegrar
  return await query(
    `
    SELECT 
      v.id, v.nro, v.solicitud_reintegro_motivo, v.solicitud_reintegro_at,
      l.numero AS lote_numero, l.manzana AS lote_manzana,
      pr.nombre AS proyecto_nombre,
      titulares_data.titulares_completo AS comprador,
      titulares_data.primer_persona_id AS persona_id,
      cob_data.cobranzas_count, cob_data.monto_total_reintegrar
    FROM ${schema}.ventas v
    JOIN ${schema}.lotes l ON l.id = v.lote_id
    JOIN ${schema}.proyectos pr ON pr.id = l.proyecto_id
    LEFT JOIN LATERAL (
      SELECT
        STRING_AGG(
          COALESCE(per.razon_social,
            TRIM(BOTH ', ' FROM COALESCE(per.apellido,'') || ', ' || COALESCE(per.nombre,''))
          ),
          ' / ' ORDER BY vt.orden
        ) AS titulares_completo,
        (ARRAY_AGG(per.id ORDER BY vt.orden))[1] AS primer_persona_id
      FROM ${schema}.venta_titulares vt
      JOIN ${schema}.personas per ON per.id = vt.persona_id
      WHERE vt.venta_id = v.id
    ) titulares_data ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS cobranzas_count,
        COALESCE(SUM(monto_total), 0)::numeric AS monto_total_reintegrar
      FROM ${schema}.cobranzas c
      WHERE c.venta_id = v.id 
        AND c.es_anticipo_venta = true
        AND c.estado IN ('BORRADOR'::tenant_template.cobranza_estado, 'CONFIRMADA'::tenant_template.cobranza_estado)
    ) cob_data ON TRUE
    WHERE v.estado = 'PENDIENTE_REINTEGRO'::tenant_template.venta_estado
    ORDER BY v.solicitud_reintegro_at ASC
    `
  );
}

export default async function ReintegrosPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  const reintegros = await getReintegrosPendientes(tenant);

  return (
    <AppShell>
      <div className="p-8 max-w-6xl">
        <Link
          href={`/ventas?t=${tenant}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft size={16} />
          Volver a Ventas
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <ClipboardList className="text-purple-600" size={28} />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Reintegros pendientes</h1>
            <p className="text-slate-500 mt-1">
              {tenantNombre} Â· {(reintegros as any[]).length} solicitud{(reintegros as any[]).length === 1 ? "" : "es"}
            </p>
          </div>
        </div>

        {(reintegros as any[]).length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <div className="text-green-700 font-medium">No hay reintegros pendientes</div>
            <div className="text-xs text-green-600 mt-1">Cuando un vendedor solicite anulaciÃ³n con reintegro, aparecerÃ¡ acÃ¡.</div>
          </div>
        ) : (
          <ReintegrosLista tenant={tenant} reintegros={reintegros as any[]} />
        )}
      </div>
    </AppShell>
  );
}
