import { NextRequest, NextResponse } from "next/server";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";

import { getSchema, getPool } from "@/lib/db";
import { armarCompradoresBloque, TitularDatos } from "@/lib/compradores-bloque";
import { numeroALetras, montoALetras, formatNumero, formatFecha, diaDelMes } from "@/lib/boleto-helpers";
import { convertirDocxAPdf } from "@/lib/docx-to-pdf";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

/**
 * POST /api/boletos/generar
 * Body: { tenant, venta_id, plantilla_id, formato?: 'docx' | 'pdf' }
 * Default: docx
 */
export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.CONTABILIDAD);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  const { tenant, venta_id, plantilla_id } = body;
  const formato: "docx" | "pdf" = body.formato === "pdf" ? "pdf" : "docx";
  if (!tenant || !venta_id || !plantilla_id) {
    return NextResponse.json({ error: "tenant, venta_id y plantilla_id requeridos" }, { status: 400 });
  }

  const schema = getSchema(tenant);
  if (!schema) return NextResponse.json({ error: "Tenant invalido" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    // 1. Traer venta + lote + proyecto (el proyecto viene a través del lote, no de la venta)
    const ventaRows = await client.query(
      `
      SELECT 
        v.id, v.estado::text AS estado, v.precio_lista, v.precio_total,
        v.descuento_financiero, v.anticipo, v.cant_cuotas, v.cuota_base,
        v.sistema_amort::text AS sistema_amort,
        v.indice_ajuste::text AS indice_ajuste,
        TO_CHAR(v.fecha_boleto, 'YYYY-MM-DD') AS fecha_boleto,
        TO_CHAR(v.fecha_primer_vto, 'YYYY-MM-DD') AS fecha_primer_vto,
        v.lote_id,
        l.numero AS lote_numero, l.manzana AS lote_manzana, l.numero_padron AS lote_padron_num,
        l.superficie_m2, l.matricula AS lote_matricula,
        l.proyecto_id, p.nombre AS proyecto_nombre
      FROM ${schema}.ventas v
      LEFT JOIN ${schema}.lotes l ON l.id = v.lote_id
      LEFT JOIN ${schema}.proyectos p ON p.id = l.proyecto_id
      WHERE v.id = $1::uuid
      `,
      [venta_id]
    );
    if (ventaRows.rows.length === 0) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    const venta = ventaRows.rows[0];

    // 2. Titulares
    const titularesRows = await client.query(
      `
      SELECT 
        vt.persona_id, vt.porcentaje, vt.orden,
        p.tipo::text AS tipo, p.nombre, p.apellido, p.razon_social,
        p.doc_numero, p.cuit, p.estado_civil, p.email, p.telefono,
        p.direccion_calle, p.direccion_numero, p.direccion_barrio,
        p.direccion_localidad, p.direccion_provincia, p.sexo
      FROM ${schema}.venta_titulares vt
      JOIN ${schema}.personas p ON p.id = vt.persona_id
      WHERE vt.venta_id = $1::uuid AND vt.fecha_baja IS NULL
      ORDER BY vt.orden
      `,
      [venta_id]
    );

    // 3. Plantilla
    const plantillaRows = await client.query(
      `SELECT nombre, archivo_nombre, archivo_bytes FROM ${schema}.plantillas_boleto WHERE id = $1::uuid AND activo = true`,
      [plantilla_id]
    );
    if (plantillaRows.rows.length === 0) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
    const plantilla = plantillaRows.rows[0];

    // 4. Cálculos: usamos cuota_base (ya calculado al cerrar venta) y precio_total
    // precio_total = el precio del boleto (precio_lista - descuentos)
    // cuota_base = el importe real de cada cuota (incluye intereses/IVA según sistema)
    const monto_cuota = Number(venta.cuota_base) || 0;
    const saldo = (Number(venta.precio_total) || 0) - (Number(venta.anticipo) || 0);

    // 5. Bloque compradores
    const titulares: TitularDatos[] = titularesRows.rows.map((r: any) => ({
      tipo: r.tipo as "FISICA" | "JURIDICA",
      nombre: r.nombre, apellido: r.apellido, razon_social: r.razon_social,
      doc_numero: r.doc_numero, cuit: r.cuit, estado_civil: r.estado_civil,
      email: r.email, telefono: r.telefono,
      direccion_calle: r.direccion_calle, direccion_numero: r.direccion_numero,
      direccion_barrio: r.direccion_barrio,
      direccion_localidad: r.direccion_localidad, direccion_provincia: r.direccion_provincia,
      sexo: r.sexo, porcentaje: Number(r.porcentaje) || 0,
    }));
    const compradores_bloque = armarCompradoresBloque(titulares);

    // 6. Lote
    const lote_padron = [
      venta.lote_manzana ? `Manzana ${venta.lote_manzana}` : null,
      venta.lote_numero ? `Lote ${venta.lote_numero}` : null,
      venta.lote_padron_num ? `Padrón ${venta.lote_padron_num}` : null,
      venta.lote_matricula ? `Matrícula ${venta.lote_matricula}` : null,
    ].filter(Boolean).join(" - ") || "[COMPLETAR]";

    const lote_superficie = venta.superficie_m2
      ? `${formatNumero(Number(venta.superficie_m2), 2)} m²`
      : "[COMPLETAR]";

    // 7. Data
    const precioBoleto = Number(venta.precio_total) || 0;
    const anticipo = Number(venta.anticipo) || 0;
    const data: Record<string, string> = {
      compradores_bloque,
      lote_padron,
      lote_superficie,
      fecha_firma: venta.fecha_boleto ? formatFecha(venta.fecha_boleto) : formatFecha(new Date()),
      precio_numero: formatNumero(precioBoleto, 2),
      precio_letras: montoALetras(precioBoleto),
      anticipo_pesos: formatNumero(anticipo, 2),
      anticipo_letras: anticipo > 0 ? montoALetras(anticipo) : "[COMPLETAR]",
      saldo_pesos: formatNumero(saldo, 2),
      saldo_letras: saldo > 0 ? montoALetras(saldo) : "[COMPLETAR]",
      cuotas_cantidad_numero: String(venta.cant_cuotas || 0),
      cuotas_cantidad_letras: venta.cant_cuotas > 0 ? numeroALetras(Number(venta.cant_cuotas)) : "[COMPLETAR]",
      cuota_pesos: monto_cuota > 0 ? formatNumero(monto_cuota, 2) : "[COMPLETAR]",
      cuota_letras: monto_cuota > 0 ? montoALetras(monto_cuota) : "[COMPLETAR]",
      primer_vencimiento: venta.fecha_primer_vto ? diaDelMes(venta.fecha_primer_vto) : "[COMPLETAR]",
    };

    // 8. Render
    const buffer: Buffer = plantilla.archivo_bytes;
    const zip = new PizZip(buffer);
    let doc: Docxtemplater;
    try {
      doc = new Docxtemplater(zip, {
        paragraphLoop: true, linebreaks: true,
        delimiters: { start: "{", end: "}" },
      });
    } catch (err: any) {
      return NextResponse.json({ error: `Error al cargar plantilla: ${err.message}` }, { status: 500 });
    }
    try {
      doc.render(data);
    } catch (err: any) {
      const msg = err.properties?.errors
        ? err.properties.errors.map((e: any) => `${e.id}: ${e.explanation}`).join("; ")
        : err.message;
      return NextResponse.json({ error: `Error al generar boleto: ${msg}` }, { status: 500 });
    }
    const docxBuffer: Buffer = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });

    // 8.5 — Si pidieron PDF, convertir
    let outputBuffer: Buffer;
    let contentType: string;
    let extension: string;
    if (formato === "pdf") {
      try {
        outputBuffer = await convertirDocxAPdf(docxBuffer);
      } catch (err: any) {
        return NextResponse.json({ 
          error: `Error al convertir a PDF: ${err.message}`,
          hint: "Verificá que LibreOffice esté instalado. Si está en otra ruta, configurá LIBREOFFICE_PATH en .env.local"
        }, { status: 500 });
      }
      contentType = "application/pdf";
      extension = "pdf";
    } else {
      outputBuffer = docxBuffer;
      contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      extension = "docx";
    }

    const filename = `Boleto_${tenant}_${venta_id.substring(0,8)}.${extension}`;

    // 9. Registrar emisión en boletos_emitidos (con formato)
    try {
      await client.query(
        `INSERT INTO ${schema}.boletos_emitidos (venta_id, plantilla_id, generado_por, archivo_nombre, formato)
         VALUES ($1::uuid, $2::uuid, $5, $3, $4)`,
        [venta_id, plantilla_id, filename, formato, sessionLabel(session)]
      );
    } catch (err: any) {
      console.error("[generar-boleto] No se pudo registrar emisión:", err.message);
    }

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("[generar-boleto] ERROR:", err);
    return NextResponse.json({ error: err.message || "Error al generar boleto" }, { status: 500 });
  } finally {
    client.release();
  }
}
