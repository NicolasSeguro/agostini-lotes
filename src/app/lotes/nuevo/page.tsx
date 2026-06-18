import { AppShell } from "@/components/AppShell";
import { LoteForm } from "@/components/LoteForm";
import { query, getSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getProyectos(tenant: string) {
  const schema = getSchema(tenant);
  if (!schema) return [];
  return await query(
    `SELECT id, nombre, codigo, centro_lat, centro_lng FROM ${schema}.proyectos ORDER BY nombre`,
    []
  ) as any[];
}

export default async function NuevoLotePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; proy?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  const proyectos = await getProyectos(tenant);

  return (
    <AppShell>
      <div className="p-8 max-w-4xl">
        <LoteForm tenant={tenant} proyectos={proyectos} modo="nuevo" />
      </div>
    </AppShell>
  );
}
