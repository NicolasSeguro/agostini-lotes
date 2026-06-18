import { AppShell } from "@/components/AppShell";
import { ProyectoForm } from "@/components/ProyectoForm";
import { query, getSchema } from "@/lib/db";
import { notFound } from "next/navigation";

async function getProyecto(tenant: string, id: string) {
  const schema = getSchema(tenant);
  if (!schema) return null;
  const rows = await query(
    `
    SELECT 
      p.id, p.codigo, p.nombre, p.tipo_proyecto, p.estado,
      p.direccion, p.localidad, p.provincia,
      p.centro_lat, p.centro_lng, p.kmz_url,
      TO_CHAR(p.fecha_lanzamiento, 'YYYY-MM-DD') AS fecha_lanzamiento,
      p.config, p.activo
    FROM ${schema}.proyectos p
    WHERE p.id = $1::uuid
    `,
    [id]
  );
  return (rows as any[])[0] || null;
}

export default async function EditarProyectoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  const proyecto = await getProyecto(tenant, id);
  if (!proyecto) notFound();
  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <ProyectoForm tenant={tenant} modo="editar" proyecto={proyecto} />
      </div>
    </AppShell>
  );
}
