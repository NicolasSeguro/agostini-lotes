import { AppShell } from "@/components/AppShell";
import { PlantillasBoletoCliente } from "@/components/PlantillasBoletoCliente";
import { query, getSchema } from "@/lib/db";
import Link from "next/link";
import { FileText, Info } from "lucide-react";

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

async function getPlantillas(tenant: string) {
  const schema = getSchema(tenant);
  if (!schema) return [];
  return await query(
    `
    SELECT 
      pb.id, pb.proyecto_id, p.nombre AS proyecto_nombre,
      pb.modalidad, pb.con_anticipo, pb.indice, pb.nombre, pb.descripcion,
      pb.archivo_nombre, pb.archivo_size, pb.updated_at
    FROM ${schema}.plantillas_boleto pb
    JOIN ${schema}.proyectos p ON p.id = pb.proyecto_id
    ORDER BY p.nombre, pb.modalidad, pb.indice
    `,
    []
  ) as any[];
}

export default async function PlantillasBoletoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  const tenantNombre = TENANTS_NOMBRES[tenant] || tenant;

  const [proyectos, plantillas] = await Promise.all([
    getProyectos(tenant),
    getPlantillas(tenant),
  ]);

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-start gap-3">
          <FileText className="text-brand-600" size={28} />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Plantillas de Boleto</h1>
            <p className="text-slate-500 mt-1">
              {tenantNombre} â€” {plantillas.length} plantilla{plantillas.length === 1 ? "" : "s"} cargada{plantillas.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-2 text-sm text-blue-900">
          <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <div><strong>CÃ³mo funciona:</strong> cargÃ¡ un archivo Word (.docx) por cada combinaciÃ³n de proyecto + modalidad + Ã­ndice. El archivo debe contener marcadores tipo <code className="bg-blue-100 px-1 rounded">{"{cliente_nombre}"}</code>, <code className="bg-blue-100 px-1 rounded">{"{precio_numero}"}</code>, etc. que el sistema reemplazarÃ¡ al generar el boleto.</div>
            <div className="mt-1">
              <Link href={`/plantillas-boleto/marcadores?t=${tenant}`} className="underline font-medium">
                Ver lista completa de marcadores disponibles
              </Link>
            </div>
          </div>
        </div>

        {proyectos.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-600 mb-3">No hay proyectos activos en este fideicomiso.</p>
            <Link href={`/proyectos?t=${tenant}`} className="inline-block px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">
              Ir a Proyectos
            </Link>
          </div>
        ) : (
          <PlantillasBoletoCliente
            tenant={tenant}
            proyectos={proyectos.map((p: any) => ({ id: p.id, nombre: p.nombre }))}
            plantillas={plantillas.map((p: any) => ({
              ...p,
              archivo_size: Number(p.archivo_size),
            }))}
          />
        )}
      </div>
    </AppShell>
  );
}
