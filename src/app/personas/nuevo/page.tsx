import { AppShell } from "@/components/AppShell";
import { PersonaForm } from "@/components/PersonaForm";

export default async function NuevaPersonaPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <PersonaForm tenant={tenant} modo="nuevo" />
      </div>
    </AppShell>
  );
}
