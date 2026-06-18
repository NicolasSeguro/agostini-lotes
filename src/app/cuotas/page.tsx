"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  Percent,
  Calendar,
  TrendingUp,
  History,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

type IndiceValor = {
  id: string;
  indice: string;
  periodo: string;
  coeficiente: string;
  valor_acumulado: string | null;
  fuente: string | null;
  fecha_publicacion: string | null;
};

type AjusteEjecucion = {
  id: string;
  indice: string;
  periodo_aplicacion: string;
  coeficiente_aplicado: string;
  estado: string;
  cuotas_afectadas: number;
  contratos_afectados: number;
  monto_saldo_antes: string;
  monto_saldo_despues: string;
  ajuste_total_aplicado: string;
  ejecutado_at: string | null;
};

function formatNumber(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "-";
  return num.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(coef: number | string): string {
  const num = typeof coef === "string" ? parseFloat(coef) : coef;
  if (isNaN(num)) return "-";
  return ((num - 1) * 100).toFixed(2) + "%";
}

function formatPeriodo(date: string): string {
  if (!date) return "-";
  const d = new Date(date);
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return meses[d.getMonth()] + "/" + d.getFullYear();
}

function EstadoBadge({ estado }: { estado: string }) {
  const config: Record<string, { bg: string; text: string; icon: any }> = {
    EJECUTADA:     { bg: "bg-emerald-100", text: "text-emerald-800", icon: CheckCircle2 },
    EN_SIMULACION: { bg: "bg-amber-100",   text: "text-amber-800",   icon: Clock },
    REVERTIDA:     { bg: "bg-slate-100",   text: "text-slate-700",   icon: History },
    CANCELADA:     { bg: "bg-rose-100",    text: "text-rose-800",    icon: XCircle },
  };
  const c = config[estado] || config.CANCELADA;
  const Icon = c.icon;
  return (
    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium " + c.bg + " " + c.text}>
      <Icon size={12} />
      {estado}
    </span>
  );
}

export default function CuotasDashboardPage() {
  const sp = useSearchParams();
  const tenant = sp.get("t") || "jacaranda";

  const [ultimoCAC, setUltimoCAC] = useState<IndiceValor | null>(null);
  const [ultimoCVS, setUltimoCVS] = useState<IndiceValor | null>(null);
  const [corridas, setCorridas] = useState<AjusteEjecucion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      setLoading(true);
      try {
        const cacRes = await fetch("/api/cuotas/indices/listar?indice=CAC&limit=1");
        const cacJson = await cacRes.json();
        setUltimoCAC(cacJson.items?.[0] || null);

        const cvsRes = await fetch("/api/cuotas/indices/listar?indice=CVS&limit=1");
        const cvsJson = await cvsRes.json();
        setUltimoCVS(cvsJson.items?.[0] || null);

        const corrRes = await fetch("/api/cuotas/ajustes/listar?t=" + tenant + "&limit=5");
        const corrJson = await corrRes.json();
        setCorridas(corrJson.items || []);
      } catch (err) {
        console.error("Error cargando dashboard cuotas:", err);
      } finally {
        setLoading(false);
      }
    }
    cargar();
  }, [tenant]);

  function mesQueAjusta(periodoStr: string, desfase: number): string {
    if (!periodoStr) return "-";
    const d = new Date(periodoStr);
    d.setMonth(d.getMonth() + desfase);
    return formatPeriodo(d.toISOString());
  }

  return (
    <AppShell>
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-brand-600 rounded-lg flex items-center justify-center">
            <Percent className="text-white" size={20} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Cuotas</h1>
        </div>
        <p className="text-slate-500">
          Aplicacion mensual de ajustes por indices (CAC, CVS) sobre cuotas vigentes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
            <TrendingUp size={16} />
            <span>Ultimo CAC publicado</span>
          </div>
          {loading ? (
            <div className="text-slate-400 text-sm">Cargando...</div>
          ) : ultimoCAC ? (
            <>
              <div className="text-3xl font-bold text-slate-900">
                {formatPct(ultimoCAC.coeficiente)}
              </div>
              <div className="text-sm text-slate-500 mt-1">
                Periodo: {formatPeriodo(ultimoCAC.periodo)} - ajusta {mesQueAjusta(ultimoCAC.periodo, 2)}
              </div>
            </>
          ) : (
            <div className="text-slate-400 text-sm">Sin datos</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
            <TrendingUp size={16} />
            <span>Ultimo CVS publicado</span>
          </div>
          {loading ? (
            <div className="text-slate-400 text-sm">Cargando...</div>
          ) : ultimoCVS ? (
            <>
              <div className="text-3xl font-bold text-slate-900">
                {formatPct(ultimoCVS.coeficiente)}
              </div>
              <div className="text-sm text-slate-500 mt-1">
                Periodo: {formatPeriodo(ultimoCVS.periodo)} - ajusta {mesQueAjusta(ultimoCVS.periodo, 3)}
              </div>
            </>
          ) : (
            <div className="text-slate-400 text-sm">Sin datos</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
            <History size={16} />
            <span>Corridas registradas</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {loading ? "..." : corridas.length}
          </div>
          <div className="text-sm text-slate-500 mt-1">
            Total visibles (max 5)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link
          href={"/cuotas/indices?t=" + tenant}
          className="group bg-white border-2 border-slate-200 hover:border-brand-500 rounded-xl p-6 transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={18} className="text-brand-600" />
                <h3 className="font-semibold text-slate-900">Indices Mensuales</h3>
              </div>
              <p className="text-sm text-slate-500">
                Ver, cargar y editar valores de CAC y CVS por mes.
              </p>
            </div>
            <ArrowRight size={20} className="text-slate-400 group-hover:text-brand-600 transition" />
          </div>
        </Link>

        <Link
          href={"/cuotas/ajustes?t=" + tenant}
          className="group bg-white border-2 border-slate-200 hover:border-brand-500 rounded-xl p-6 transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Percent size={18} className="text-brand-600" />
                <h3 className="font-semibold text-slate-900">Ajustes de Cuotas</h3>
              </div>
              <p className="text-sm text-slate-500">
                Simular y aplicar el ajuste mensual a las cuotas vigentes.
              </p>
            </div>
            <ArrowRight size={20} className="text-slate-400 group-hover:text-brand-600 transition" />
          </div>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Corridas recientes</h3>
          <Link
            href={"/cuotas/ajustes?t=" + tenant}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            Ver todas
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : corridas.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-400 text-sm mb-3">
              No hay corridas de ajuste registradas todavia.
            </div>
            <Link
              href={"/cuotas/ajustes/nuevo?t=" + tenant}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition"
            >
              <Percent size={16} />
              Aplicar primer ajuste
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-slate-600">Periodo</th>
                <th className="text-left px-6 py-3 font-medium text-slate-600">Indice</th>
                <th className="text-right px-6 py-3 font-medium text-slate-600">Coef.</th>
                <th className="text-right px-6 py-3 font-medium text-slate-600">Cuotas</th>
                <th className="text-right px-6 py-3 font-medium text-slate-600">Ajuste $</th>
                <th className="text-center px-6 py-3 font-medium text-slate-600">Estado</th>
                <th className="text-center px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {corridas.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {formatPeriodo(c.periodo_aplicacion)}
                  </td>
                  <td className="px-6 py-3 text-slate-700">{c.indice}</td>
                  <td className="px-6 py-3 text-right text-slate-700">
                    {formatPct(c.coeficiente_aplicado)}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-700">
                    {c.cuotas_afectadas?.toLocaleString("es-AR") || "-"}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-700 font-mono">
                    $ {formatNumber(c.ajuste_total_aplicado)}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <EstadoBadge estado={c.estado} />
                  </td>
                  <td className="px-6 py-3 text-center">
                    <Link
                      href={"/cuotas/ajustes/" + c.id + "?t=" + tenant}
                      className="text-brand-600 hover:text-brand-700 text-xs font-medium"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </AppShell>
  );
}