import { AppShell } from "@/components/AppShell";
import { TENANTS } from "@/lib/db";
import { PickerCobranzas } from "./PickerCobranzas";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NuevaCobranzaPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const tenantNombre = TENANTS.find((t) => t.slug === tenant)?.nombre || "?";

  return (
    <AppShell>
      <div className="p-8 max-w-3xl">
        <Link
          href={`/cobranzas?t=${tenant}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft size={16} />
          Volver a Cobranzas
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Nueva Cobranza</h1>
          <p className="text-slate-500 mt-1">{tenantNombre}</p>
        </div>

        <PickerCobranzas tenant={tenant} />
      </div>
    </AppShell>
  );
}
