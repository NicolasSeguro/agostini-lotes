import { NextRequest, NextResponse } from "next/server";
import { requirePublicApiKey } from "@/lib/api-key";
import { loadTenants } from "@/lib/db";

export async function GET(req: NextRequest) {
  const denied = requirePublicApiKey(req);
  if (denied) return denied;

  const tenants = await loadTenants();
  return NextResponse.json({
    desarrollos: tenants.map((t) => ({
      slug: t.slug,
      nombre: t.nombre,
    })),
  });
}
