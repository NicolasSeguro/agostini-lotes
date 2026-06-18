import { AppShell } from "@/components/AppShell";
import { query, getSchema, TENANTS } from "@/lib/db";
import { NuevaVentaForm } from "@/app/ventas/nueva/NuevaVentaForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

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

async function getVentaParaEdit(tenantSlug: string, ventaId: string) {
  const schema = getSchema(tenantSlug);
  const rows = await query(
    `
    SELECT 
      v.id, v.estado::text AS estado, v.precio_lista, v.precio_total,
      v.anticipo, v.descuento_financiero,
      v.cant_cuotas, v.sistema_amort::text AS sistema_amort,
      v.tasa_interes_mensual, v.indice_ajuste::text AS indice_ajuste,
      v.fecha_primer_vto, v.fecha_boleto, v.observaciones,
      v.convenio_id, v.convenio_razon_social, v.convenio_tipo_beneficio, 
      v.convenio_valor_beneficio,
      l.id AS lote_id, l.numero AS lote_numero, l.manzana AS lote_manzana,
      l.numero_padron, l.superficie_m2, l.precio_lista AS lote_precio_lista, l.moneda,
      pr.id AS proyecto_id
    FROM ${schema}.ventas v
    JOIN ${schema}.lotes l ON l.id = v.lote_id
    JOIN ${schema}.proyectos pr ON pr.id = l.proyecto_id
    WHERE v.id = $1::uuid
    `,
    [ventaId]
  );
  if ((rows as any[]).length === 0) return null;
  const v = (rows as any[])[0];

  const titulares = await query(
    `
    SELECT 
      vt.persona_id, vt.porcentaje, vt.orden,
      COALESCE(p.razon_social,
        TRIM(BOTH ', ' FROM COALESCE(p.apellido,'') || ', ' || COALESCE(p.nombre,''))
      ) AS nombre,
      p.cuit, p.doc_numero
    FROM ${schema}.venta_titulares vt
    JOIN ${schema}.personas p ON p.id = vt.persona_id
    WHERE vt.venta_id = $1::uuid
    ORDER BY vt.orden
    `,
    [ventaId]
  );

  // Convertir al formato esperado por NuevaVentaForm
  return {
    id: v.id,
    estado: v.estado,
    lote_proyecto_id: v.proyecto_id,
    lote: {
      id: v.lote_id,
      numero: v.lote_numero,
      manzana: v.lote_manzana,
      numero_padron: v.numero_padron,
      superficie_m2: v.superficie_m2,
      precio_lista: v.lote_precio_lista,
      moneda: v.moneda,
    },
    titulares: (titulares as any[]).map((t) => ({
      persona: {
        id: t.persona_id,
        nombre: t.nombre,
        cuit: t.cuit,
        doc_numero: t.doc_numero,
      },
      porcentaje: parseFloat(t.porcentaje || 0),
    })),
    precio_lista: parseFloat(v.precio_lista || 0),
    descuento_financiero: parseFloat(v.descuento_financiero || 0),
    anticipo: parseFloat(v.anticipo || 0),
    cant_cuotas: v.cant_cuotas,
    sistema_amort: v.sistema_amort === "FRANCES" ? "FRANCES" : "AJUSTABLE",
    tasa_interes_mensual: parseFloat(v.tasa_interes_mensual || 0),
    indice_ajuste: v.indice_ajuste || "NINGUNO",
    fecha_primer_vto: v.fecha_primer_vto ? new Date(v.fecha_primer_vto).toISOString().slice(0, 10) : "",
    fecha_boleto: v.fecha_boleto ? new Date(v.fecha_boleto).toISOString().slice(0, 10) : "",
    observaciones: v.observaciones || "",
    convenio_id: v.convenio_id || null,
    convenio_razon_social: v.convenio_razon_social || null,
    convenio_tipo_beneficio: v.convenio_tipo_beneficio || null,
    convenio_valor_beneficio: v.convenio_valor_beneficio ? parseFloat(v.convenio_valor_beneficio) : null,
  };
}

export default async function EditarVentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; cambiarLote?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  const permitirCambiarLote = sp.cambiarLote === "1";
  
  const [proyectos, porcGravado, ventaInicial] = await Promise.all([
    getProyectos(tenant),
    getPorcGravado(tenant),
    getVentaParaEdit(tenant, id),
  ]);

  if (!ventaInicial) notFound();
  if (ventaInicial.estado !== "EN_CARGA") {
    redirect(`/ventas/${id}?t=${tenant}`);
  }

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <Link
          href={`/ventas/${id}?t=${tenant}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft size={16} />
          Volver al detalle
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">
            {permitirCambiarLote ? "Continuar carga de venta (con cambio de lote)" : "Continuar carga de venta"}
          </h1>
          <p className="text-slate-500 mt-1">
            {tenantNombre} Â· Porcentaje gravado: {(porcGravado * 100).toFixed(0)}%
          </p>
        </div>

        <NuevaVentaForm
          tenant={tenant}
          porcGravado={porcGravado}
          proyectos={proyectos as any[]}
          ventaInicial={ventaInicial as any}
          permitirCambiarLote={permitirCambiarLote}
        />
      </div>
    </AppShell>
  );
}
