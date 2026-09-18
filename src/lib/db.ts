import { Pool } from "pg";

let pool: Pool | null = null;

/**
 * Pool de conexiones a PostgreSQL.
 *
 * Modo produccion (Railway):
 *   - Usa DATABASE_URL (connection string completo)
 *   - SSL activado (Railway requiere TLS, cert self-signed)
 *
 * Modo desarrollo local:
 *   - Usa DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *   - Sin SSL
 */
export function getPool(): Pool {
  if (!pool) {
    if (process.env.DATABASE_URL) {
      const url = process.env.DATABASE_URL;
      const needsSsl =
        process.env.NODE_ENV === "production" ||
        /railway\.(app|internal)|rlwy\.net/i.test(url);
      pool = new Pool({
        connectionString: url,
        ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
        max: 10,
      });
    } else {
      // Modo desarrollo local (vars individuales)
      pool = new Pool({
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "admin123",
        database: process.env.DB_NAME || "ADI_ERP",
        max: 10,
      });
    }
  }
  return pool;
}

export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const p = getPool();
  const res = await p.query(sql, params);
  return res.rows as T[];
}

const SCHEMA_RE = /^tenant_[a-z0-9_]+$/;

export type TenantInfo = { slug: string; nombre: string; schema: string };

export const TENANTS: TenantInfo[] = [
  { slug: "jacaranda", nombre: "Jacaranda", schema: "tenant_jacaranda" },
  { slug: "tipuana", nombre: "Tipuana", schema: "tenant_tipuana" },
  { slug: "alisos", nombre: "Alisos", schema: "tenant_alisos" },
  { slug: "boulevard", nombre: "Boulevard", schema: "tenant_boulevard" },
];

export type TenantSlug = (typeof TENANTS)[number]["slug"];

const tenantBySlug = new Map<string, TenantInfo>(
  TENANTS.map((t) => [t.slug, t])
);

let tenantsFetchedAt = 0;

export async function loadTenants(): Promise<TenantInfo[]> {
  if (Date.now() - tenantsFetchedAt < 60_000 && tenantBySlug.size > 0) {
    return Array.from(tenantBySlug.values());
  }
  try {
    const rows = await query<{
      slug: string;
      nombre: string;
      schema_name: string;
    }>(
      `SELECT slug, nombre, COALESCE(schema_name, 'tenant_' || slug) AS schema_name
       FROM shared.tenants
       WHERE COALESCE(activo, true) = true
       ORDER BY nombre`
    );
    if (rows.length) {
      tenantBySlug.clear();
      for (const row of rows) {
        const schema = row.schema_name;
        if (!SCHEMA_RE.test(schema)) continue;
        tenantBySlug.set(row.slug, {
          slug: row.slug,
          nombre: row.nombre,
          schema,
        });
      }
      tenantsFetchedAt = Date.now();
    }
  } catch {
    // Tabla shared.tenants puede no existir todavia: usamos whitelist.
  }
  return Array.from(tenantBySlug.values());
}

export function getSchema(slug: string): string {
  const tenant = tenantBySlug.get(slug) || TENANTS.find((t) => t.slug === slug);
  if (!tenant || !SCHEMA_RE.test(tenant.schema)) {
    throw new Error(`Fideicomiso desconocido: ${slug}`);
  }
  return tenant.schema;
}
