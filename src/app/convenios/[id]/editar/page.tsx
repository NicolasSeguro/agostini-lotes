import { AppShell } from "@/components/AppShell";
import { ConvenioForm } from "@/components/ConvenioForm";
import { query } from "@/lib/db";
import { notFound } from "next/navigation";

async function getConvenio(id: string) {
  const rows = await query(
    `SELECT 
      id, razon_social, cuit, 
      TO_CHAR(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
      TO_CHAR(fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
      tipo_beneficio::text AS tipo_beneficio, valor_beneficio,
      tenants_aplicables, activo, observaciones
    FROM shared.convenios
    WHERE id = $1::uuid`,
    [id]
  );
  return (rows as any[])[0] || null;
}

export default async function EditarConvenioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";

  const convenio = await getConvenio(id);
  if (!convenio) notFound();

  return (
    <AppShell>
      <div className="p-8 max-w-4xl">
        <ConvenioForm 
          tenant={tenant} 
          modo="editar" 
          convenio={convenio}
        />
      </div>
    </AppShell>
  );
}
