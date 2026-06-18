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
      // Modo Railway / produccion
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
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

// Lista de fideicomisos disponibles
export const TENANTS = [
  { slug: "jacaranda", nombre: "Jacaranda", schema: "tenant_jacaranda" },
  { slug: "tipuana", nombre: "Tipuana", schema: "tenant_tipuana" },
  { slug: "alisos", nombre: "Alisos", schema: "tenant_alisos" },
  { slug: "boulevard", nombre: "Boulevard", schema: "tenant_boulevard" },
] as const;

export type TenantSlug = (typeof TENANTS)[number]["slug"];

export function getSchema(slug: string): string {
  const tenant = TENANTS.find((t) => t.slug === slug);
  if (!tenant) throw new Error(`Fideicomiso desconocido: ${slug}`);
  return tenant.schema;
}
