import { AppShell } from "@/components/AppShell";
import { ImportLotesCliente } from "@/components/ImportLotesCliente";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const TENANTS_NOMBRES: Record<string, string> = {
  jacaranda: "Jacaranda", tipuana: "Tipuana", alisos: "Alisos", boulevard: "Boulevard",
};

export default async function ImportarLotesPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <Link href={`/lotes?t=${tenant}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4">
          <ArrowLeft size={16} /> Volver al listado
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Importar Lotes desde Excel</h1>
          <p className="text-slate-500 mt-1">
            {TENANTS_NOMBRES[tenant] || tenant}
          </p>
        </div>

        <ImportLotesCliente tenant={tenant} />
      </div>
    </AppShell>
  );
}
