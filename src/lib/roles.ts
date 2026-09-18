export type Role = "ADMIN" | "ADMIN_B" | "VENDEDOR" | "CAJERO";

/**
 * Como opera ADI:
 *  - ADMIN     = gerencia (Laura): autoriza ventas
 *  - ADMIN_B   = contabilidad: contabiliza, ajustes CAC, boletos
 *  - VENDEDOR  = carga ventas, no autoriza ni cobra
 *  - CAJERO    = cobra y reintegra, no autoriza
 */
export const ROLES = {
  ALL: ["ADMIN", "ADMIN_B", "VENDEDOR", "CAJERO"] as Role[],
  GERENCIA: ["ADMIN"] as Role[],
  CONTABILIDAD: ["ADMIN", "ADMIN_B"] as Role[],
  CAJA: ["ADMIN", "ADMIN_B", "CAJERO"] as Role[],
  VENTAS: ["ADMIN", "ADMIN_B", "VENDEDOR"] as Role[],
  ADMIN_ONLY: ["ADMIN"] as Role[],
};

const ALIASES: Record<string, Role> = {
  ADMIN: "ADMIN",
  ADMIN_B: "ADMIN_B",
  VENDEDOR: "VENDEDOR",
  CAJERO: "CAJERO",
  GERENTE: "ADMIN",
  GERENCIA: "ADMIN",
  LAURA: "ADMIN",
};

export function normalizeRole(raw: string | null | undefined): Role {
  const key = (raw || "").trim().toUpperCase().replace(/\s+/g, "_");
  return ALIASES[key] || "VENDEDOR";
}

export function roleAllowed(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}
