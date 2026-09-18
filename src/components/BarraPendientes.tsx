"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, FileText, DollarSign, AlertTriangle, ChevronRight, XCircle, RotateCcw } from "lucide-react";

type Resumen = {
  en_carga: number;
  cerrada_pendiente: number;
  cerrada_confirmada: number;
  autorizada: number;
  rechazadas: number;
  pendiente_reintegro: number;
  req_auth_desc_pendiente: number;
};

export function BarraPendientes({ tenant }: { tenant: string }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/ventas/pendientes-resumen?t=${tenant}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setResumen(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tenant]);

  if (loading) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-sm text-slate-500">
        Cargando pendientes...
      </div>
    );
  }
  if (!resumen) return null;

  const totalActivo = resumen.en_carga + resumen.cerrada_pendiente + resumen.cerrada_confirmada + resumen.autorizada;
  const totalAlerta = resumen.rechazadas + resumen.pendiente_reintegro;
  
  if (totalActivo === 0 && totalAlerta === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-sm text-green-700 flex items-center gap-2">
        <FileText size={14} />
        No hay ventas pendientes en el workflow
      </div>
    );
  }

  const cardsActivas = [
    {
      label: "En carga", count: resumen.en_carga,
      color: "from-slate-100 to-slate-50 border-slate-200 text-slate-700",
      iconColor: "text-slate-500", icon: FileText,
      href: `/ventas?t=${tenant}&estado=EN_CARGA`,
      description: "Borradores del vendedor",
    },
    {
      label: "Esperan anticipo", count: resumen.cerrada_pendiente,
      color: "from-blue-50 to-blue-50/50 border-blue-200 text-blue-700",
      iconColor: "text-blue-500", icon: DollarSign,
      href: `/ventas?t=${tenant}&estado=CERRADA_PENDIENTE`,
      description: "Cajero debe cobrar anticipo",
    },
    {
      label: "Para autorizar", count: resumen.cerrada_confirmada,
      color: "from-cyan-50 to-cyan-50/50 border-cyan-200 text-cyan-700",
      iconColor: "text-cyan-500", icon: Clock,
      href: `/ventas?t=${tenant}&estado=CERRADA_CONFIRMADA`,
      description: "Gerente Comercial",
      badge: resumen.req_auth_desc_pendiente,
    },
    {
      label: "Para contabilizar", count: resumen.autorizada,
      color: "from-amber-50 to-amber-50/50 border-amber-200 text-amber-700",
      iconColor: "text-amber-500", icon: FileText,
      href: `/ventas?t=${tenant}&estado=AUTORIZADA`,
      description: "Admin Contabilidad",
    },
  ];

  const cardsAlerta = [
    {
      label: "Rechazadas", count: resumen.rechazadas,
      color: "from-red-50 to-red-50/50 border-red-200 text-red-700",
      iconColor: "text-red-500", icon: XCircle,
      href: `/ventas?t=${tenant}&estado=RECHAZADA_COMERCIAL,RECHAZADA_CONTABILIDAD`,
      description: "Esperan decision del vendedor",
    },
    {
      label: "Reintegros pendientes", count: resumen.pendiente_reintegro,
      color: "from-purple-50 to-purple-50/50 border-purple-200 text-purple-700",
      iconColor: "text-purple-500", icon: RotateCcw,
      href: `/caja/reintegros?t=${tenant}`,
      description: "Caja debe procesar reintegro",
    },
  ];

  return (
    <div className="mb-6 space-y-4">
      {totalActivo > 0 && (
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">
            Workflow activo
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {cardsActivas.map(c => <Tarjeta key={c.label} c={c} />)}
          </div>
        </div>
      )}

      {totalAlerta > 0 && (
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">
            Atencion
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cardsAlerta.map(c => <Tarjeta key={c.label} c={c} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Tarjeta({ c }: { c: any }) {
  const Icon = c.icon;
  const isEmpty = c.count === 0;
  return (
    <Link
      href={c.href}
      className={`bg-gradient-to-br ${c.color} border rounded-xl p-4 hover:shadow-md transition group ${isEmpty ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between mb-2">
        <Icon size={18} className={c.iconColor} />
        <div className="flex items-center gap-2">
          {!!c.badge && c.badge > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded font-medium" title="Requiere autorizacion extra">
              <AlertTriangle size={10} />
              {c.badge}
            </span>
          )}
          <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
        </div>
      </div>
      <div className="text-3xl font-bold mb-1">{c.count}</div>
      <div className="text-xs font-medium mb-0.5">{c.label}</div>
      <div className="text-xs opacity-70">{c.description}</div>
    </Link>
  );
}
