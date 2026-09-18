import { AppShell } from "@/components/AppShell";
import { PageHeader, opsOutlineBtn, opsTableWrap } from "@/components/ops-ui";
import { getPersonasMaestro } from "@/lib/personas-shared";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PersonasMaestroPage() {
  const data = await getPersonasMaestro();

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-6xl">
        <PageHeader
          kicker="Cartera compartida"
          title="Maestro de personas"
          description="Mismo DNI o CUIT en varios fideicomisos. Las ventas siguen apuntando a la persona de cada tenant: esto es el catálogo y el reporte de duplicados, no un rewrite de FKs."
          actions={
            <Link href="/personas" className={opsOutlineBtn}>
              Volver a Personas
            </Link>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Filas por fideicomiso", value: data.filasTenant },
            { label: "Documentos únicos", value: data.unicosConDoc },
            { label: "Maestro shared", value: data.maestro },
            { label: "Vínculos", value: data.vinculos },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-2xl border border-stone-200/80 bg-white/80 p-4"
            >
              <div className="text-[11px] uppercase tracking-[0.16em] text-stone-400">
                {k.label}
              </div>
              <div className="font-serif text-3xl text-ink mt-1">{k.value}</div>
            </div>
          ))}
        </div>

        <div className={opsTableWrap}>
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left text-stone-500">
              <tr>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Fideicomisos</th>
                <th className="px-4 py-3 text-right">Filas</th>
              </tr>
            </thead>
            <tbody>
              {data.duplicados.map((d) => (
                <tr key={d.doc} className="border-t border-stone-100">
                  <td className="px-4 py-3 font-mono text-ink">{d.doc}</td>
                  <td className="px-4 py-3 text-stone-800">
                    {d.nombres.join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {d.fideicomisos.join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right">{d.cantidad}</td>
                </tr>
              ))}
              {data.duplicados.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-stone-500" colSpan={4}>
                    No hay DNI/CUIT repetidos entre fideicomisos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
