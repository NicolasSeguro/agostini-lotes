import { AppShell } from "@/components/AppShell";
import { PersonaForm } from "@/components/PersonaForm";
import { query, getSchema } from "@/lib/db";
import { notFound } from "next/navigation";

async function getPersona(tenant: string, id: string) {
  const schema = getSchema(tenant);
  if (!schema) return null;
  const rows = await query(
    `
    SELECT 
      p.id, p.tipo::text AS tipo, p.doc_tipo::text AS doc_tipo, p.doc_numero, p.cuit,
      p.apellido, p.nombre, p.razon_social, p.cond_iva::text AS cond_iva,
      TO_CHAR(p.fecha_nac, 'YYYY-MM-DD') AS fecha_nac,
      p.estado_civil, p.profesion, p.actividad,
      p.sujeto_obligado, p.sujeto_expuesto,
      TO_CHAR(p.inicio_actividad, 'YYYY-MM-DD') AS inicio_actividad,
      p.email, p.email_alt, p.telefono, p.telefono_alt,
      p.direccion_calle, p.direccion_numero, p.direccion_barrio, p.direccion_localidad,
      p.direccion_provincia, p.direccion_pais,
      p.referente_nombre, p.referente_doc_tipo, p.referente_doc_numero, p.referente_cargo,
      p.observaciones, p.activo
    FROM ${schema}.personas p
    WHERE p.id = $1::uuid
    `,
    [id]
  );
  return (rows as any[])[0] || null;
}

export default async function EditarPersonaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";

  const persona = await getPersona(tenant, id);
  if (!persona) notFound();

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <PersonaForm tenant={tenant} modo="editar" persona={persona} />
      </div>
    </AppShell>
  );
}
