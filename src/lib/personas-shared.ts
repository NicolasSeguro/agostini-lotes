import { getSchema, loadTenants, query } from "@/lib/db";

export type PersonaCruce = {
  doc: string;
  cantidad: number;
  fideicomisos: string[];
  nombres: string[];
};

function sqlIdent(name: string) {
  if (!/^tenant_[a-z0-9_]+$/.test(name)) {
    throw new Error("schema invalido");
  }
  return name;
}

export async function getPersonasMaestro() {
  const tenants = await loadTenants();
  const unions = tenants
    .map((t, i) => {
      const schema = sqlIdent(getSchema(t.slug));
      return `
        SELECT
          $${i + 1}::text AS tenant_slug,
          p.id,
          regexp_replace(
            COALESCE(NULLIF(btrim(p.cuit), ''), NULLIF(btrim(p.doc_numero), ''), ''),
            '[^0-9]', '', 'g'
          ) AS doc,
          COALESCE(p.razon_social, TRIM(CONCAT(p.apellido, ' ', p.nombre))) AS nombre
        FROM ${schema}.personas p
      `;
    })
    .join(" UNION ALL ");

  const params = tenants.map((t) => t.slug);
  const rows = unions
    ? await query<{
        tenant_slug: string;
        id: string;
        doc: string;
        nombre: string;
      }>(unions, params)
    : [];

  const byDoc = new Map<string, PersonaCruce>();
  for (const row of rows) {
    if (!row.doc || row.doc.length < 7) continue;
    const cur = byDoc.get(row.doc) || {
      doc: row.doc,
      cantidad: 0,
      fideicomisos: [],
      nombres: [],
    };
    cur.cantidad += 1;
    if (!cur.fideicomisos.includes(row.tenant_slug)) {
      cur.fideicomisos.push(row.tenant_slug);
    }
    if (row.nombre && !cur.nombres.includes(row.nombre)) {
      cur.nombres.push(row.nombre);
    }
    byDoc.set(row.doc, cur);
  }

  const duplicados = Array.from(byDoc.values())
    .filter((d) => d.fideicomisos.length > 1 || d.cantidad > 1)
    .sort((a, b) => b.fideicomisos.length - a.fideicomisos.length);

  let maestro = 0;
  let vinculos = 0;
  try {
    const m = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM shared.personas`
    );
    maestro = m[0]?.n || 0;
    const v = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM shared.persona_tenants`
    );
    vinculos = v[0]?.n || 0;
  } catch {
    maestro = 0;
    vinculos = 0;
  }

  return {
    tenants: tenants.length,
    filasTenant: rows.length,
    unicosConDoc: byDoc.size,
    maestro,
    vinculos,
    duplicados,
  };
}
