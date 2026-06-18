import { AppShell } from "@/components/AppShell";
import { FideicomisoForm } from "@/components/FideicomisoForm";
import { query } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function getFideicomiso(idOrSlug: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const cond = isUuid ? "id = $1::uuid" : "slug = $1";
  const rows = await query(
    `
    SELECT 
      id, slug, schema_name, razon_social, nombre_fantasia, cuit,
      cond_iva::text AS cond_iva,
      TO_CHAR(inicio_actividad, 'YYYY-MM-DD') AS inicio_actividad,
      domicilio_fiscal, config, datos_fiscales, activo
    FROM shared.tenants
    WHERE ${cond}
    `,
    [idOrSlug]
  );
  return (rows as any[])[0] || null;
}

export default async function EditarFideicomisoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fideicomiso = await getFideicomiso(id);
  if (!fideicomiso) notFound();
  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <FideicomisoForm fideicomiso={fideicomiso} />
      </div>
    </AppShell>
  );
}
