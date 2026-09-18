import { ROLES, normalizeRole, roleAllowed, type Role } from "../src/lib/roles";

describe("matriz de roles ADI", () => {
  const vendedor: Role = "VENDEDOR";
  const laura: Role = "ADMIN";
  const conta: Role = "ADMIN_B";
  const caja: Role = "CAJERO";

  it("solo gerencia (Laura / ADMIN) autoriza ventas", () => {
    expect(roleAllowed(laura, ROLES.GERENCIA)).toBe(true);
    expect(roleAllowed(vendedor, ROLES.GERENCIA)).toBe(false);
    expect(roleAllowed(conta, ROLES.GERENCIA)).toBe(false);
    expect(roleAllowed(caja, ROLES.GERENCIA)).toBe(false);
  });

  it("vendedor no contabiliza, no ajusta cuotas ni cobra", () => {
    expect(roleAllowed(vendedor, ROLES.CONTABILIDAD)).toBe(false);
    expect(roleAllowed(vendedor, ROLES.CAJA)).toBe(false);
    expect(roleAllowed(vendedor, ROLES.VENTAS)).toBe(true);
  });

  it("caja cobra y no autoriza", () => {
    expect(roleAllowed(caja, ROLES.CAJA)).toBe(true);
    expect(roleAllowed(caja, ROLES.GERENCIA)).toBe(false);
    expect(roleAllowed(caja, ROLES.CONTABILIDAD)).toBe(false);
  });

  it("contabilidad contabiliza y no autoriza comercial", () => {
    expect(roleAllowed(conta, ROLES.CONTABILIDAD)).toBe(true);
    expect(roleAllowed(conta, ROLES.GERENCIA)).toBe(false);
  });

  it("alias GERENTE se mapea a ADMIN (Laura)", () => {
    expect(normalizeRole("GERENTE")).toBe("ADMIN");
    expect(normalizeRole("gerencia")).toBe("ADMIN");
    expect(roleAllowed(normalizeRole("GERENTE"), ROLES.GERENCIA)).toBe(true);
  });
});
