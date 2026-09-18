import { NextResponse } from "next/server";
import { requireRole, ROLES } from "@/lib/auth";
import { loadTenants } from "@/lib/db";

export async function GET() {
  const authz = await requireRole(ROLES.ALL);
  if (!authz.ok) return authz.response;
  const tenants = await loadTenants();
  return NextResponse.json({ tenants });
}
