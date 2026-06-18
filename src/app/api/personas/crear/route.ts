import { NextRequest, NextResponse } from "next/server";
import { getSchema, getPool } from "@/lib/db";

type Body = {
  tenant: string;
  tipo: "FISICA" | "JURIDICA";
  apellido?: string;
  nombre?: string;
  razon_social?: string;
  doc_tipo: string;
  doc_numero: string;
  cuit?: string;
  cond_iva?: string;
  fecha_nac?: string | null;
  estado_civil?: string | null;
  profesion?: string | null;        // "OcupaciÃ³n" en la pantalla
  actividad?: string | null;
  sujeto_obligado?: boolean;
  sujeto_expuesto?: boolean;
  inicio_actividad?: string | null;  // jurÃ­dicas
  email?: string;
  email_alt?: string;
  telefono?: string;
  telefono_alt?: string;
  direccion_calle?: string;
  direccion_numero?: string;
  direccion_barrio?: string;
  direccion_localidad?: string;
  direccion_provincia?: string;
  direccion_pais?: string;
  // Referente (jurÃ­dicas)
  referente_nombre?: string | null;
  referente_doc_tipo?: string | null;
  referente_doc_numero?: string | null;
  referente_cargo?: string | null;
  observaciones?: string | null;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 }); }

  if (!body.tenant) return NextResponse.json({ error: "tenant requerido" }, { status: 400 });

  // NormalizaciÃ³n de identificaciÃ³n:
  // - FISICA: requiere doc_numero
  // - JURIDICA: requiere CUIT; si no hay documento, se usa el CUIT como doc_numero
  if (body.tipo === "JURIDICA") {
    if (!body.cuit || body.cuit.replace(/[^0-9]/g, "").length < 10) {
      return NextResponse.json({ error: "El CUIT es obligatorio para persona jurÃ­dica" }, { status: 400 });
    }
    if (!body.doc_numero || !body.doc_numero.trim()) {
      // Usar CUIT (sin guiones) como documento
      body.doc_numero = body.cuit.replace(/[^0-9]/g, "");
      body.doc_tipo = "CUIT";
    }
  } else {
    if (!body.doc_numero || body.doc_numero.trim().length < 5) {
      return NextResponse.json({ error: "NÃºmero de documento invÃ¡lido (mÃ­nimo 5 caracteres)" }, { status: 400 });
    }
  }
  if (body.tipo === "FISICA" && (!body.apellido || !body.nombre)) {
    return NextResponse.json({ error: "Apellido y nombre son obligatorios para persona fÃ­sica" }, { status: 400 });
  }
  if (body.tipo === "JURIDICA" && !body.razon_social) {
    return NextResponse.json({ error: "RazÃ³n social es obligatoria para persona jurÃ­dica" }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) return NextResponse.json({ error: `Tenant invÃ¡lido: ${body.tenant}` }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    const dup = await client.query(
      `SELECT id FROM ${schema}.personas WHERE doc_numero = $1 AND deleted_at IS NULL LIMIT 1`,
      [body.doc_numero.trim()]
    );
    if (dup.rows.length > 0) {
      return NextResponse.json({
        error: `Ya existe una persona con ese documento (${body.doc_tipo} ${body.doc_numero})`,
        existing_id: dup.rows[0].id
      }, { status: 409 });
    }

    const result = await client.query(
      `
      INSERT INTO ${schema}.personas
        (tipo, doc_tipo, doc_numero, cuit, apellido, nombre, razon_social, cond_iva,
         fecha_nac, estado_civil, profesion, actividad,
         sujeto_obligado, sujeto_expuesto, inicio_actividad,
         email, email_alt, telefono, telefono_alt,
         direccion_calle, direccion_numero, direccion_barrio, direccion_localidad,
         direccion_provincia, direccion_pais,
         referente_nombre, referente_doc_tipo, referente_doc_numero, referente_cargo,
         observaciones, activo, nacionalidad)
      VALUES 
        ($1::shared.persona_tipo, $2::shared.doc_tipo, $3, $4, $5, $6, $7, $8::shared.cond_iva,
         $9::date, $10, $11, $12,
         $13, $14, $15::date,
         $16, $17, $18, $19,
         $20, $21, $22, $23,
         $24, COALESCE($25,'Argentina'),
         $26, $27, $28, $29,
         $30, true, 'Argentina')
      RETURNING id, apellido, nombre, razon_social, cuit, doc_numero
      `,
      [
        body.tipo, body.doc_tipo, body.doc_numero.trim(), body.cuit?.trim() || null,
        body.apellido?.trim() || null, body.nombre?.trim() || null, body.razon_social?.trim() || null,
        body.cond_iva || "CF",
        body.fecha_nac || null, body.estado_civil || null, body.profesion?.trim() || null, body.actividad?.trim() || null,
        body.sujeto_obligado || false, body.sujeto_expuesto || false, body.inicio_actividad || null,
        body.email?.trim() || null, body.email_alt?.trim() || null, body.telefono?.trim() || null, body.telefono_alt?.trim() || null,
        body.direccion_calle?.trim() || null, body.direccion_numero?.trim() || null, body.direccion_barrio?.trim() || null, body.direccion_localidad?.trim() || null,
        body.direccion_provincia?.trim() || null, body.direccion_pais?.trim() || null,
        body.referente_nombre?.trim() || null, body.referente_doc_tipo || null, body.referente_doc_numero?.trim() || null, body.referente_cargo?.trim() || null,
        body.observaciones?.trim() || null,
      ]
    );

    const persona = result.rows[0];

    try {
      await client.query(
        `INSERT INTO ${schema}.persona_roles (persona_id, rol) VALUES ($1, 'CLIENTE'::shared.persona_rol) ON CONFLICT DO NOTHING`,
        [persona.id]
      );
    } catch { /* no crÃ­tico */ }

    return NextResponse.json({
      ok: true,
      persona: {
        id: persona.id,
        nombre: persona.razon_social || `${persona.apellido || ""}, ${persona.nombre || ""}`.replace(/^, |, $/g, ""),
        cuit: persona.cuit,
        doc_numero: persona.doc_numero,
      }
    });
  } catch (err: any) {
    console.error("[crear-persona] ERROR:", err.message, err.detail);
    return NextResponse.json({ error: `Error al crear persona: ${err.message}`, sql_detail: err.detail || null }, { status: 500 });
  } finally {
    client.release();
  }
}
