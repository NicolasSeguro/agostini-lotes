import { AppShell } from "@/components/AppShell";
import { MapaProyectoCliente } from "@/components/MapaProyectoCliente";
import { SelectorProyectoMapa } from "@/components/SelectorProyectoMapa";
import { query, getSchema } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, AlertCircle, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

const TENANTS = [
  { slug: "jacaranda", nombre: "Jacaranda" },
  { slug: "tipuana", nombre: "Tipuana" },
  { slug: "alisos", nombre: "Alisos" },
  { slug: "boulevard", nombre: "Boulevard" },
];

async function getProyectos(tenant: string) {
  const schema = getSchema(tenant);
  if (!schema) return [];
  return await query(
    `SELECT id, nombre, codigo, centro_lat, centro_lng FROM ${schema}.proyectos ORDER BY nombre`,
    []
  ) as any[];
}

async function getLotes(tenant: string, proyectoId: string | null) {
  const schema = getSchema(tenant);
  if (!schema) return { conGeom: [], sinGeom: 0, total: 0 };

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (proyectoId) {
    conditions.push(`l.proyecto_id = $${idx++}`);
    params.push(proyectoId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Lotes con geometrÃ­a
  const conGeom = await query(
    `
    SELECT 
      l.id, l.numero, l.manzana, l.estado::text AS estado,
      l.precio_lista, l.superficie_m2, l.geom_json,
      (SELECT 
        COALESCE(per.razon_social, TRIM(BOTH ', ' FROM COALESCE(per.apellido,'') || ', ' || COALESCE(per.nombre,'')))
       FROM ${schema}.ventas v
       JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id
       JOIN ${schema}.personas per ON per.id = vt.persona_id
       WHERE v.lote_id = l.id 
         AND v.estado::text NOT IN ('ANULADA','RECHAZADA_COMERCIAL','RECHAZADA_CONTABILIDAD')
       ORDER BY vt.orden LIMIT 1) AS comprador_actual
    FROM ${schema}.lotes l
    ${where} ${where ? "AND" : "WHERE"} l.geom_json IS NOT NULL
    `,
    params
  ) as any[];

  // Conteos totales
  const counts = await query(
    `SELECT 
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE geom_json IS NOT NULL)::int AS con_geom
     FROM ${schema}.lotes l
     ${where}`,
    params
  ) as any[];

  return {
    conGeom,
    sinGeom: (counts[0].total || 0) - (counts[0].con_geom || 0),
    total: counts[0].total || 0,
  };
}

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; proy?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  const tenantNombre = TENANTS.find(t => t.slug === tenant)?.nombre || tenant;
  const proyectoId = sp.proy || null;

  const [proyectos, datos] = await Promise.all([
    getProyectos(tenant),
    getLotes(tenant, proyectoId),
  ]);

  const proyectoActual = proyectos.find((p: any) => p.id === proyectoId);
  const proyectoCentro = proyectoActual?.centro_lat && proyectoActual?.centro_lng
    ? { lat: Number(proyectoActual.centro_lat), lng: Number(proyectoActual.centro_lng) }
    : null;

  const porcGeoref = datos.total > 0 ? Math.round((datos.conGeom.length / datos.total) * 100) : 0;

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <Link
          href={`/lotes?t=${tenant}${proyectoId ? `&proy=${proyectoId}` : ""}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft size={16} /> Volver al listado
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <MapPin className="text-brand-600" size={28} />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Mapa de Lotes</h1>
              <p className="text-slate-500 mt-1">
                {tenantNombre}
                {proyectoActual && ` Â· ${proyectoActual.nombre}`}
              </p>
            </div>
          </div>
        </div>

        {/* Selector de proyecto */}
        <SelectorProyectoMapa
          tenant={tenant}
          proyectos={proyectos.map((p: any) => ({ id: p.id, nombre: p.nombre }))}
          proyectoActual={proyectoId}
        />

        {/* Aviso de cobertura */}
        {datos.total > 0 && datos.sinGeom > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2 text-sm">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-amber-900">
                {datos.conGeom.length} de {datos.total} lotes georreferenciados ({porcGeoref}%)
              </span>
              <span className="text-amber-700">
                . Quedan {datos.sinGeom} lote{datos.sinGeom === 1 ? "" : "s"} sin dibujar en el mapa.
              </span>
              <Link
                href={`/lotes?t=${tenant}${proyectoId ? `&proy=${proyectoId}` : ""}`}
                className="ml-2 underline text-amber-800 hover:text-amber-900"
              >
                Ir al listado para cargarlos
              </Link>
            </div>
          </div>
        )}

        {datos.total === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
            No hay lotes para mostrar.
          </div>
        ) : datos.conGeom.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <MapPin className="mx-auto text-slate-300 mb-3" size={48} />
            <div className="text-slate-600 font-medium mb-1">NingÃºn lote tiene geometrÃ­a cargada todavÃ­a</div>
            <p className="text-sm text-slate-500 mb-4">
              EditÃ¡ un lote y dibujÃ¡ su contorno en el mapa para verlo acÃ¡.
            </p>
            <Link
              href={`/lotes?t=${tenant}${proyectoId ? `&proy=${proyectoId}` : ""}`}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              Ir al listado de lotes
            </Link>
          </div>
        ) : (
          <MapaProyectoCliente
            tenant={tenant}
            lotes={datos.conGeom}
            proyectoCentro={proyectoCentro}
          />
        )}
      </div>
    </AppShell>
  );
}
