"use client";

/**
 * notificaciones-alumno.tsx — «Perfil › Notificaciones» (Fase 3, punto D).
 *
 * Compone TRES fuentes que ya existen en UNA lista: los comentarios que ya vienen
 * dentro de `actionObtenerPerfilAlumno`, las justificaciones de
 * `actionObtenerJustificacionesDeAlumno` — la MISMA acción que usa el calendario
 * de asistencia, no una vía nueva — y los reportes disciplinarios de
 * `actionListarReportesDeAlumno` (2026-10-01). Cada fuente falla por separado:
 * si los reportes no se pueden leer, las justificaciones se siguen viendo.
 *
 * El componente NO decide qué entra ni en qué orden: eso vive en el módulo puro
 * `lib/navegacion/notificaciones-alumno.ts` (con su suite). Aquí solo se pide el
 * dato que falta, se pinta y se filtra por el modo activo de la barra
 * («Comentarios» · «Justificaciones» · «Reportes», rótulos que manda el mapa).
 *
 * El aviso destacado del diseño usa `--oc-alert` como PUNTO y `--oc-alert-text`
 * cuando el estado va escrito; nunca al revés.
 */
import { useEffect, useState } from "react";
import { actionObtenerJustificacionesDeAlumno } from "@/app/actions/justificaciones";
import { actionListarReportesDeAlumno } from "@/app/actions/administracion";
import {
  filtrarPorModo,
  hayPendiente,
  notificacionesDeAlumno,
  type NotificacionAlumno,
} from "@/lib/navegacion/notificaciones-alumno";
import type { FilaJustificacion } from "@/lib/escolar/asistencia/justificaciones";
import type { ReporteVisible } from "@/lib/escolar/administracion/administracion";
import type { ComentarioRow } from "@/lib/escolar/types";

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente de revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

function claseEstado(estado: string): string {
  if (estado === "aprobada") return "text-[var(--oc-ok)]";
  return "text-[var(--oc-alert-text)]";
}

/** Solo lo grave usa el color de alerta; leve y media van en el tono neutro. */
function claseGravedad(gravedad: string): string {
  return gravedad === "grave" ? "text-[var(--oc-alert-text)]" : "text-[var(--oc-muted)]";
}

export function NotificacionesAlumno({
  curp,
  comentarios,
  modo,
}: {
  curp: string;
  comentarios: readonly ComentarioRow[];
  /** Modo activo: «Comentarios» · «Justificaciones» · «Reportes» · otro = sin filtrar. */
  modo: string | null;
}) {
  const [justificaciones, setJustificaciones] = useState<FilaJustificacion[]>([]);
  const [reportes, setReportes] = useState<ReporteVisible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);

  useEffect(() => {
    if (!curp) return;
    let activo = true;
    void Promise.all([
      actionObtenerJustificacionesDeAlumno(curp),
      actionListarReportesDeAlumno(curp),
    ])
      .then(([j, r]) => {
        if (!activo) return;
        const fallos: string[] = [];
        if (j.ok) setJustificaciones(j.justificaciones);
        else fallos.push(j.error);
        if (r.ok) setReportes(r.reportes);
        else fallos.push(r.error);
        setErrores(fallos);
      })
      .catch(() => {
        if (activo) setErrores(["No se pudieron consultar las notificaciones."]);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [curp]);

  const lista: NotificacionAlumno[] = notificacionesDeAlumno({
    comentarios: comentarios.map((c) => ({ comentario: c.COMENTARIO, fecha: c.FECHA })),
    justificaciones: justificaciones.map((j) => ({
      fecha: j.fecha,
      motivo: j.motivo,
      estado: j.estado,
    })),
    reportes,
  });
  const visibles = filtrarPorModo(lista, modo);
  const avisoPendiente = hayPendiente(visibles)
    ? visibles.find((n) => n.estado === "pendiente")
    : undefined;

  if (cargando) {
    return (
      <p className="text-center text-sm font-semibold text-[var(--oc-muted)]">
        Consultando notificaciones…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {errores.map((e) => (
        <p key={e} className="text-center text-xs font-semibold text-[var(--oc-alert-text)]" role="alert">
          {e}
        </p>
      ))}

      {visibles.length === 0 && errores.length === 0 && (
        <p className="text-center text-sm font-semibold text-[var(--oc-muted)]">
          Sin novedades en esta vista.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {visibles.map((n) => {
          const esAviso = avisoPendiente !== undefined && n.clave === avisoPendiente.clave;
          return (
            <li
              key={n.clave}
              className={`rounded-2xl border px-4 py-3 ${
                esAviso
                  ? "border-[var(--oc-alert)]/60 bg-[var(--oc-input)]"
                  : "border-[var(--oc-border)] bg-[var(--oc-surface)]"
              }`}
            >
              <p className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                {esAviso && (
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--oc-alert)]"
                  />
                )}
                <span>{n.titulo}</span>
                {n.fecha && <span>· {n.fecha}</span>}
                {n.estado && (
                  <span className={`font-extrabold ${claseEstado(n.estado)}`}>
                    · {ETIQUETA_ESTADO[n.estado] ?? n.estado}
                  </span>
                )}
                {n.gravedad && (
                  <span className={`font-extrabold ${claseGravedad(n.gravedad)}`}>
                    · Gravedad: {n.gravedad}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--oc-text)]">{n.detalle}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
