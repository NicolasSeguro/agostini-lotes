import { AppShell } from "@/components/AppShell";
import { query } from "@/lib/db";
import Link from "next/link";
import { Pencil, Building2 } from "lucide-react";

async function getFideicomisos() {
  return await query(
    `
    SELECT 
      id, slug, schema_name, razon_social, nombre_fantasia, cuit,
      cond_iva::text AS cond_iva,
      TO_CHAR(inicio_actividad, 'DD/MM/YYYY') AS inicio_actividad,
      domicilio_fiscal, datos_fiscales, activo
    FROM shared.tenants
    ORDER BY razon_social
    `,
    []
  ) as any[];
}

export default async function FideicomisosPage() {
  const fideicomisos = await getFideicomisos();

  return (
    <AppShell>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-start gap-3">
          <Building2 className="text-brand-600" size={28} />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Fideicomisos</h1>
            <p className="text-slate-500 mt-1">
              {fideicomisos.length} fideicomiso{fideicomisos.length === 1 ? "" : "s"} en el sistema
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-900">
          <strong>Nota:</strong> el alta de nuevos fideicomisos se realiza por script de migraciÃ³n. AcÃ¡ podÃ©s editar los existentes.
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">RazÃ³n social</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">CUIT</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cond. IVA</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Inicio actividad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Datos fiscales</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">AcciÃ³n</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {fideicomisos.map((f) => {
                const df = f.datos_fiscales || {};
                const tieneCompleto = !!(df.reg_inmobiliario?.matricula || df.escritura?.numero || df.banco?.cbu);
                return (
                  <tr key={f.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{f.razon_social}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">{f.slug}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">{f.cuit}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{f.cond_iva}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{f.inicio_actividad || <span className="text-slate-400">â€”</span>}</td>
                    <td className="px-4 py-3 text-sm">
                      {tieneCompleto ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Cargados</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500">Pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/fideicomisos/${f.slug}/editar`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-100 text-slate-700"
                      >
                        <Pencil size={12} /> Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {fideicomisos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No hay fideicomisos cargados.
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
