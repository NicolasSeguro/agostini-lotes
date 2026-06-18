import { AppShell } from "@/components/AppShell";
import { ProyectoForm } from "@/components/ProyectoForm";

export default async function NuevoProyectoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";
  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <ProyectoForm tenant={tenant} modo="nuevo" />
      </div>
    </AppShell>
  );
}
