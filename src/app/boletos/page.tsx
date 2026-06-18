import { AppShell } from "@/components/AppShell";
import { BoletosCliente } from "@/components/BoletosCliente";
import { query, getSchema } from "@/lib/db";
import { FileSignature } from "lucide-react";

export const dynamic = "force-dynamic";

const TENANTS_NOMBRES: Record<string, string> = {
  jacaranda: "Jacaranda", tipuana: "Tipuana", alisos: "Alisos", boulevard: "Boulevard",
};

async function getProyectos(tenant: string) {
  const schema = getSchema(tenant);
  if (!schema) return [];
  return await query(
    `SELECT id, nombre FROM ${schema}.proyectos WHERE activo = true ORDER BY nombre`,
    []
  ) as any[];
}

export default async function BoletosPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  const tenantNombre = TENANTS_NOMBRES[tenant] || tenant;
  const proyectos = await getProyectos(tenant);

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-start gap-3">
          <FileSignature className="text-brand-600" size={28} />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Boletos</h1>
            <p className="text-slate-500 mt-1">
              {tenantNombre} â€” GeneraciÃ³n de boletos de compraventa para ventas contabilizadas
            </p>
          </div>
        </div>

        <BoletosCliente 
          tenant={tenant}
          proyectos={proyectos.map((p: any) => ({ id: p.id, nombre: p.nombre }))}
        />
      </div>
    </AppShell>
  );
}
