import { AppShell } from "@/components/AppShell";
import { LoteForm } from "@/components/LoteForm";
import { query, getSchema } from "@/lib/db";
import { notFound } from "next/navigation";

async function getProyectos(tenant: string) {
  const schema = getSchema(tenant);
  if (!schema) return [];
  return await query(`SELECT id, nombre, codigo, centro_lat, centro_lng FROM ${schema}.proyectos ORDER BY nombre`, []) as any[];
}

async function getLote(tenant: string, id: string) {
  const schema = getSchema(tenant);
  if (!schema) return null;
  const rows = await query(
    `
    SELECT id, proyecto_id, numero, manzana, numero_padron,
      superficie_m2, frente_ml, fondo_ml, zona,
      precio_lista, precio_x_m2, coeficiente, moneda,
      estado::text AS estado, matricula,
      tiene_agua, tiene_luz, tiene_cloacas, tiene_gas, geom_json
    FROM ${schema}.lotes WHERE id = $1::uuid
    `,
    [id]
  );
  return (rows as any[])[0] || null;
}

export default async function EditarLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";

  const [proyectos, lote] = await Promise.all([
    getProyectos(tenant),
    getLote(tenant, id),
  ]);
  if (!lote) notFound();

  return (
    <AppShell>
      <div className="p-8 max-w-4xl">
        <LoteForm tenant={tenant} proyectos={proyectos} lote={lote} modo="editar" />
      </div>
    </AppShell>
  );
}
