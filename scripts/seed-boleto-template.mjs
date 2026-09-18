/**
 * Genera un .docx minimo con marcadores de boleto y lo carga en cada tenant.
 * Uso: DATABASE_URL=... node scripts/seed-boleto-template.mjs
 */
import PizZip from "pizzip";
import pg from "pg";

function buildDocx() {
  const zip = new PizZip();
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>BOLETO DE COMPRAVENTA — Agostini DI (demo)</w:t></w:r></w:p>
    <w:p><w:r><w:t>Compradores: {compradores_bloque}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Lote: {lote_padron} — {lote_superficie}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Fecha: {fecha_firma}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Precio: $ {precio_numero} ({precio_letras})</w:t></w:r></w:p>
    <w:p><w:r><w:t>Anticipo: $ {anticipo_pesos} — Saldo: $ {saldo_pesos}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Cuotas: {cuotas_cantidad_numero} de $ {cuota_pesos}. Primer vto: {primer_vencimiento}</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  zip.file("word/document.xml", xml);
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url.replace(/[?&]sslmode=[^&]*/gi, ""),
  ssl: /railway|rlwy/i.test(url) ? { rejectUnauthorized: false } : undefined,
});

const buf = buildDocx();

const schemas = await pool.query(`
  SELECT nspname FROM pg_namespace
  WHERE nspname LIKE 'tenant_%' AND nspname <> 'tenant_template'
  ORDER BY nspname
`);

for (const { nspname: sch } of schemas.rows) {
  const proj = await pool.query(`SELECT id FROM ${sch}.proyectos ORDER BY nombre LIMIT 1`);
  if (!proj.rows[0]) {
    console.log(sch, "sin proyecto, skip");
    continue;
  }
  const pid = proj.rows[0].id;
  await pool.query(
    `INSERT INTO ${sch}.plantillas_boleto
      (proyecto_id, modalidad, con_anticipo, indice, nombre, descripcion, archivo_nombre, archivo_bytes, archivo_size, activo)
     VALUES ($1, 'CUOTAS', true, 'FIJO', 'Demo cuotas con anticipo', 'Plantilla staging', 'boleto-demo.docx', $2, $3, true)
     ON CONFLICT (proyecto_id, modalidad, con_anticipo, indice) DO UPDATE SET
       nombre = EXCLUDED.nombre,
       archivo_bytes = EXCLUDED.archivo_bytes,
       archivo_size = EXCLUDED.archivo_size,
       archivo_nombre = EXCLUDED.archivo_nombre,
       activo = true,
       updated_at = now()`,
    [pid, buf, buf.length]
  );
  console.log("plantilla", sch, pid);
}

await pool.end();
console.log("OK", buf.length, "bytes");
