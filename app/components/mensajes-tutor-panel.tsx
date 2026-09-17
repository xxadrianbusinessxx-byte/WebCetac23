"use client";

/**
 * mensajes-tutor-panel.tsx — la bandeja personal del tutor.
 *
 * EXTRAÍDO de `app/tutor/tutor-client.tsx` (Fase 9). Era la última pieza que
 * impedía retirar `/tutor`: vivía escrita en línea en la pestaña «Mensajes» y
 * el shell no tenía qué montar.
 *
 * ── Por qué tiene apartado propio y no es un modo de Notificaciones ───────
 * `actionListarMensajesDelTutor` devuelve los mensajes dirigidos AL TUTOR
 * —`destinatario_tipo = "tutor"`, con marca de leído— de TODOS sus alumnos a
 * la vez. CRUZA el alcance del selector de alumno: no habla del hijo elegido,
 * habla del tutor. Meterla como modo de Notificaciones mezclaría «lo de este
 * hijo» con «lo mío» en el mismo sitio.
 *
 * De ahí el rótulo «Mis mensajes»: es lo único de esa pestaña que no cambia al
 * cambiar de alumno, y conviene que se note antes de abrirlo.
 *
 * La lógica no cambió: misma action, mismo orden (más recientes primero), y el
 * motivo del rechazo sigue destacado cuando lo hay — que es el dato por el que
 * un tutor abre esta pantalla.
 */
import { useCallback, useEffect, useState } from "react";
import {
  actionListarMensajesDelTutor,
  type MensajeJustificacionConDetalle,
} from "@/app/actions/justificaciones";

export function MensajesTutorPanel() {
  const [mensajes, setMensajes] = useState<MensajeJustificacionConDetalle[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    // Los `setState` van dentro de los callbacks de la promesa, nunca en la fase
    // síncrona del efecto: ahí fuerzan un render en cascada antes del dato
    // (regla `react-hooks/set-state-in-effect`). Mismo patrón que
    // `buscador-alumno-profesor.tsx` y `horario-escolar-panel.tsx`.
    return Promise.resolve()
      .then(() => {
        setCargando(true);
        setError(null);
      })
      .then(() => actionListarMensajesDelTutor())
      .then((res) => {
        setCargando(false);
        if (res.ok) setMensajes(res.mensajes);
        else setError(res.error);
      });
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
        Mensajes de justificaciones
      </p>

      {error && (
        <p className="text-xs font-semibold text-[var(--oc-alert-text)]" role="alert">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="text-sm font-semibold text-[var(--oc-muted)]">Cargando mensajes…</p>
      ) : mensajes.length === 0 ? (
        <p className="text-xs font-semibold text-[var(--oc-muted)]">
          No tienes mensajes de justificaciones.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {mensajes.map((m) => {
            const rechazada = m.justificacion?.estado === "rechazada";
            return (
              <li
                key={m.id}
                className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                      rechazada
                        ? "bg-[var(--oc-alert)]/15 text-[var(--oc-alert-text)]"
                        : "bg-[var(--oc-ok)]/15 text-[var(--oc-ok)]"
                    }`}
                  >
                    {rechazada ? "Rechazada" : (m.justificacion?.estado ?? "Justificación")}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--oc-muted)]">
                    {m.justificacion
                      ? `${m.justificacion.fecha} · ${m.justificacion.curpAlumno}`
                      : "Justificación"}
                    {" · "}
                    {new Date(m.created_at).toLocaleString("es-MX", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>

                <p className="text-sm font-semibold text-[var(--oc-text)]">{m.mensaje}</p>

                {m.justificacion?.motivoRechazo && (
                  <p className="mt-2 rounded-lg border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-3 py-2 text-xs font-semibold text-[var(--oc-alert-text)]">
                    Motivo del rechazo: {m.justificacion.motivoRechazo}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
