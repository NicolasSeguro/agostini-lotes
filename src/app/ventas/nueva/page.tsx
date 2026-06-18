import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { NuevaVentaForm } from "./NuevaVentaForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

async function getProyectos(tenantSlug: string) {
  const schema = getSchema(tenantSlug);
  return await query(`
    SELECT 
      id, nombre, nombre_abreviado,
      COALESCE((config->>'tope_desc_financiero_pct')::numeric, 0.10) AS tope_desc_financiero_pct
    FROM ${schema}.proyectos
    ORDER BY nombre
  `);
}

async function getPorcGravado(tenantSlug: string): Promise<number> {
  const rows = await query(
    `SELECT COALESCE((config->>'porc_gravado')::numeric, 0) AS porc_gravado
     FROM shared.tenants WHERE slug = $1`,
    [tenantSlug]
  );
  return parseFloat((rows as any[])[0]?.porc_gravado || 0);
}

export default async function NuevaVentaPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  const [proyectos, porcGravado] = await Promise.all([
    getProyectos(tenant),
    getPorcGravado(tenant),
  ]);

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <Link
          href={`/ventas?t=${tenant}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft size={16} />
          Volver a Ventas
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Nueva Venta</h1>
          <p className="text-slate-500 mt-1">
            {tenantNombre} Â· Porcentaje gravado: {(porcGravado * 100).toFixed(0)}%
          </p>
        </div>

        {(proyectos as any[]).length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            No hay proyectos cargados para este fideicomiso.
          </div>
        ) : (
          <NuevaVentaForm
            tenant={tenant}
            porcGravado={porcGravado}
            proyectos={proyectos as any[]}
          />
        )}
      </div>
    </AppShell>
  );
}
