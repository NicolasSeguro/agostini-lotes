import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Grupo = {
  titulo: string;
  marcadores: { campo: string; descripcion: string; ejemplo: string }[];
};

const GRUPOS: Grupo[] = [
  {
    titulo: "Cliente / Titular principal",
    marcadores: [
      { campo: "{cliente_nombre}", descripcion: "Apellido y nombre, o razÃ³n social (jurÃ­dicas)", ejemplo: "PEREZ, JUAN CARLOS" },
      { campo: "{cliente_dni}", descripcion: "NÃºmero de documento", ejemplo: "20.000.000" },
      { campo: "{cliente_cuil}", descripcion: "CUIL/CUIT formateado", ejemplo: "20-20000000-3" },
      { campo: "{cliente_estado_civil}", descripcion: "Estado civil", ejemplo: "casado" },
      { campo: "{cliente_email}", descripcion: "Email principal", ejemplo: "juan@correo.com" },
      { campo: "{cliente_celular}", descripcion: "TelÃ©fono", ejemplo: "(0388) 411-2233" },
      { campo: "{cliente_calle}", descripcion: "Domicilio (calle y nÃºmero)", ejemplo: "Belgrano 123" },
      { campo: "{cliente_barrio}", descripcion: "Barrio", ejemplo: "Centro" },
      { campo: "{cliente_localidad}", descripcion: "Localidad", ejemplo: "San Salvador de Jujuy" },
      { campo: "{cliente_provincia}", descripcion: "Provincia", ejemplo: "Jujuy" },
    ],
  },
  {
    titulo: "Lote",
    marcadores: [
      { campo: "{lote_padron}", descripcion: "IdentificaciÃ³n catastral del lote", ejemplo: "Mz 5 - Lt 12" },
      { campo: "{lote_superficie}", descripcion: "Superficie con unidad", ejemplo: "350 mÂ²" },
    ],
  },
  {
    titulo: "Precio y montos",
    marcadores: [
      { campo: "{precio_numero}", descripcion: "Precio total en nÃºmeros (formateado)", ejemplo: "35.000.000" },
      { campo: "{precio_letras}", descripcion: "Precio total en letras", ejemplo: "TREINTA Y CINCO MILLONES" },
      { campo: "{anticipo_pesos}", descripcion: "Anticipo en nÃºmeros", ejemplo: "5.000.000" },
      { campo: "{anticipo_letras}", descripcion: "Anticipo en letras", ejemplo: "CINCO MILLONES" },
      { campo: "{saldo_pesos}", descripcion: "Saldo a financiar en nÃºmeros", ejemplo: "30.000.000" },
      { campo: "{saldo_letras}", descripcion: "Saldo a financiar en letras", ejemplo: "TREINTA MILLONES" },
    ],
  },
  {
    titulo: "Cuotas",
    marcadores: [
      { campo: "{cuotas_cantidad_numero}", descripcion: "Cantidad de cuotas", ejemplo: "60" },
      { campo: "{cuotas_cantidad_letras}", descripcion: "Cantidad de cuotas en letras", ejemplo: "SESENTA" },
      { campo: "{cuota_pesos}", descripcion: "Importe de la cuota en nÃºmeros", ejemplo: "500.000" },
      { campo: "{cuota_letras}", descripcion: "Importe de la cuota en letras", ejemplo: "QUINIENTOS MIL" },
      { campo: "{primer_vencimiento}", descripcion: "DÃ­a del primer vencimiento", ejemplo: "10/06/2026" },
    ],
  },
  {
    titulo: "Fechas",
    marcadores: [
      { campo: "{fecha_firma}", descripcion: "Fecha del boleto / firma", ejemplo: "29/05/2026" },
    ],
  },
];

export default async function MarcadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const tenant = sp.t || "jacaranda";

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <Link href={`/plantillas-boleto?t=${tenant}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4">
          <ArrowLeft size={16} /> Volver a plantillas
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Marcadores disponibles</h1>
        <p className="text-slate-500 mb-6">
          Estos son los marcadores que el sistema reemplaza automÃ¡ticamente al generar el boleto. Insertalos tal cual en la plantilla Word (con las llaves).
        </p>

        <div className="space-y-5">
          {GRUPOS.map(g => (
            <div key={g.titulo} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
                <h2 className="font-semibold text-slate-900">{g.titulo}</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-5 py-2 text-left text-xs text-slate-500 font-medium uppercase">Marcador</th>
                    <th className="px-5 py-2 text-left text-xs text-slate-500 font-medium uppercase">DescripciÃ³n</th>
                    <th className="px-5 py-2 text-left text-xs text-slate-500 font-medium uppercase">Ejemplo</th>
                  </tr>
                </thead>
                <tbody>
                  {g.marcadores.map(m => (
                    <tr key={m.campo} className="border-b border-slate-100">
                      <td className="px-5 py-2"><code className="text-sm bg-slate-100 text-brand-700 px-1.5 py-0.5 rounded">{m.campo}</code></td>
                      <td className="px-5 py-2 text-slate-700">{m.descripcion}</td>
                      <td className="px-5 py-2 text-slate-500 text-xs">{m.ejemplo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          <strong>Nota:</strong> en el Turno 2 (generaciÃ³n de boletos) se podrÃ¡n agregar mÃ¡s marcadores si los necesitÃ¡s (datos del fideicomiso, representante, escribano, etc.). Por ahora, estos son los que ya tienen las plantillas convertidas que te entregamos.
        </div>
      </div>
    </AppShell>
  );
}
