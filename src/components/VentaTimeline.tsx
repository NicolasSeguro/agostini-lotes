import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type Evento = {
  estado_anterior?: string | null;
  estado_nuevo: string;
  usuario_label?: string | null;
  fecha: string;
  motivo?: string | null;
};

const TONE: Record<string, "brand" | "sage" | "info" | "warning" | "success" | "danger" | "default"> = {
  EN_CARGA: "default",
  CERRADA_PENDIENTE: "info",
  CERRADA_CONFIRMADA: "warning",
  AUTORIZADA: "sage",
  CONTABILIZADA: "success",
  RECHAZADA_COMERCIAL: "danger",
  RECHAZADA_CONTABILIDAD: "danger",
  PENDIENTE_REINTEGRO: "warning",
  ANULADA: "danger",
};

export function VentaTimeline({ eventos }: { eventos: Evento[] }) {
  if (!eventos?.length) return null;
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-6">
      <h2 className="font-semibold text-stone-900 mb-4">Linea de tiempo</h2>
      <ol className="space-y-4">
        {eventos.map((h, idx) => (
          <li key={`${h.fecha}-${idx}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-500 mt-1.5" />
              {idx < eventos.length - 1 && (
                <span className="flex-1 w-px bg-stone-200 my-1" />
              )}
            </div>
            <div className="pb-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[h.estado_nuevo] || "default"}>
                  {h.estado_nuevo.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-stone-500">
                  {h.usuario_label || "sistema"} · {formatDate(h.fecha)}
                </span>
              </div>
              {h.motivo && (
                <p className="text-sm text-stone-600 mt-1">{h.motivo}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
