import { AppShell } from "@/components/AppShell";
import { AsistenteChat } from "@/components/AsistenteChat";
import { getSession } from "@/lib/auth";
import { getOpsSnapshot } from "@/lib/ops-snapshot";
import { responderAsistente } from "@/lib/asistente";
import { hasAnthropicKey } from "@/lib/asistente-llm";

export const dynamic = "force-dynamic";

export default async function AsistentePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const tenant = params.t || "jacaranda";
  const session = await getSession();
  const snap = await getOpsSnapshot(tenant);
  const saludo = responderAsistente("resumen del dia", snap);

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
          Inteligencia
        </p>
        <h1 className="font-serif text-4xl text-ink mt-1">Asistente</h1>
        <p className="text-stone-500 mt-2 max-w-xl">
          Lee ventas, mora, stock y cobranzas del fideicomiso activo. No calcula
          cuotas ni autoriza solo.
          {hasAnthropicKey()
            ? " Claude está conectado."
            : " Sin ANTHROPIC_API_KEY usa el resumen heurístico."}
        </p>
        <div className="mt-8 rounded-3xl border border-stone-200/80 bg-white/80 p-5 md:p-6">
          <AsistenteChat
            tenant={tenant}
            saludo={`Hola ${session?.nombre?.split(" ")[0] || ""}. ${saludo}`}
          />
        </div>
      </div>
    </AppShell>
  );
}
