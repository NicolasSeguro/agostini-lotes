import { AppShell } from "@/components/AppShell";
import { ConvenioForm } from "@/components/ConvenioForm";

export default async function NuevoConvenioPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";

  return (
    <AppShell>
      <div className="p-8 max-w-4xl">
        <ConvenioForm tenant={tenant} modo="nuevo" />
      </div>
    </AppShell>
  );
}
