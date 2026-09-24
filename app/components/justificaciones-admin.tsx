"use client";

/**
 * C4.27 — PANEL ADMINISTRATIVO DE JUSTIFICACIONES (directivo).
 * Consume el backend probado (C4.26-B). No crea estructuras paralelas.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  actionAprobarJustificacion,
  actionListarHistorialJustificaciones,
  actionListarJustificacionesPendientesConDetalle,
  actionObtenerUrlArchivoJustificacion,
  actionRechazarJustificacion,
} from "@/app/actions/justificaciones";
import type { JustificacionConDetalle } from "@/lib/escolar/asistencia/justificaciones";

function PanelTab({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] sm:text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}

function GreyActionPill({
  children,
  className = "",
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

export function JustificacionesAdmin() {
  const [pendientes, setPendientes] = useState<JustificacionConDetalle[]>([]);
  const [historial, setHistorial] = useState<JustificacionConDetalle[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "ok" | "error";
  } | null>(null);

  // Flujo de aprobación (con confirmación) y de rechazo (motivo obligatorio).
  const [confirmandoAprobar, setConfirmandoAprobar] = useState<string | null>(
    null,
  );
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [operando, setOperando] = useState(false);

  const cargar = useCallback(() => {
    // Los `setState` van dentro de los callbacks de la promesa, nunca en la fase
    // síncrona del efecto: ahí fuerzan un render en cascada antes del dato
    // (regla `react-hooks/set-state-in-effect`). Mismo patrón que
    // `buscador-alumno-profesor.tsx` y `horario-escolar-panel.tsx`.
    return Promise.resolve()
      .then(() => setCargando(true))
      .then(() =>
        Promise.all([
          actionListarJustificacionesPendientesConDetalle(),
          actionListarHistorialJustificaciones(),
        ]),
      )
      .then(([p, h]) => {
        setCargando(false);
        if (p.ok) setPendientes(p.justificaciones);
        else setMensaje({ texto: p.error, tipo: "error" });
        if (h.ok) setHistorial(h.justificaciones);
      });
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function onVerArchivo(id: string) {
    const res = await actionObtenerUrlArchivoJustificacion(id);
    if (res.ok) {
      window.open(res.url, "_blank", "noopener,noreferrer");
    } else {
      setMensaje({ texto: res.error, tipo: "error" });
    }
  }

  async function onAprobar(id: string) {
    setOperando(true);
    const res = await actionAprobarJustificacion(id);
    setOperando(false);
    if (res.ok) {
      setConfirmandoAprobar(null);
      setMensaje({
        texto: `Justificación aprobada: ${res.clasesAplicadas} clase(s) aplicada(s).`,
        tipo: "ok",
      });
      await cargar();
    } else {
      setMensaje({ texto: res.error, tipo: "error" });
    }
  }

  async function onRechazar(id: string) {
    if (!motivoRechazo.trim()) {
      setMensaje({
        texto: "El motivo del rechazo es obligatorio.",
        tipo: "error",
      });
      return;
    }
    setOperando(true);
    const res = await actionRechazarJustificacion(id, motivoRechazo.trim());
    setOperando(false);
    if (res.ok) {
      setRechazando(null);
      setMotivoRechazo("");
      setMensaje({ texto: "Justificación rechazada.", tipo: "ok" });
      await cargar();
    } else {
      setMensaje({ texto: res.error, tipo: "error" });
    }
  }

  return (
    <div className="relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-3 sm:p-4">
      <PanelTab className="mx-auto w-fit">
        Justificaciones pendientes ({pendientes.length})
      </PanelTab>

      {mensaje && (
        <p
          role="status"
          className={`rounded-xl border px-4 py-2 text-center text-xs font-bold ${
            mensaje.tipo === "ok"
              ? "border-[var(--oc-ok)]/50 bg-[var(--oc-ok)]/15 text-[var(--oc-ok)]"
              : "border-[var(--oc-alert)]/50 bg-[var(--oc-alert)]/15 text-[var(--oc-alert-text)]"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {cargando ? (
        <p className="text-center text-sm font-semibold text-[var(--oc-muted)]">
          Cargando solicitudes…
        </p>
      ) : pendientes.length === 0 ? (
        <p className="text-center text-xs font-semibold text-[var(--oc-muted)]">
          No hay justificaciones pendientes de revisión.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pendientes.map((j) => (
            <li
              key={j.id}
              className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-4 "
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-[var(--oc-text)]">
                  {j.alumnoNombre || j.curp_alumno}
                </p>
                <span className="rounded-full bg-[var(--oc-alert)]/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-alert-text)]">
                  Pendiente
                </span>
              </div>
              <div className="flex flex-col gap-1 text-xs font-semibold text-[var(--oc-muted)] sm:flex-row sm:flex-wrap sm:gap-x-4">
                <span>CURP: {j.curp_alumno}</span>
                <span>
                  Grupo: {j.grado} {j.grupo}
                </span>
                <span>Fecha: {j.fecha}</span>
                <span>Motivo: {j.motivo}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <GreyActionPill onClick={() => void onVerArchivo(j.id)}>
                  Ver archivo adjunto
                </GreyActionPill>
                <div className="flex flex-wrap gap-2">
                  <GreyActionPill
                    onClick={() => {
                      setRechazando(null);
                      setConfirmandoAprobar(j.id);
                    }}
                    disabled={operando}
                    className="text-[var(--oc-ok)]"
                  >
                    Aprobar
                  </GreyActionPill>
                  <GreyActionPill
                    onClick={() => {
                      setConfirmandoAprobar(null);
                      setMotivoRechazo("");
                      setRechazando((prev) => (prev === j.id ? null : j.id));
                    }}
                    disabled={operando}
                    className="text-[var(--oc-alert-text)]"
                  >
                    Rechazar
                  </GreyActionPill>
                </div>
              </div>

              {confirmandoAprobar === j.id && (
                <div className="mt-3 rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 p-3">
                  <p className="mb-2 text-center text-xs font-extrabold text-[var(--oc-alert-text)]">
                    ¿Confirmar la aprobación? La falta se convertirá en
                    asistencia y no se podrá deshacer.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <GreyActionPill
                      onClick={() => setConfirmandoAprobar(null)}
                      disabled={operando}
                    >
                      Cancelar
                    </GreyActionPill>
                    <GreyActionPill
                      onClick={() => void onAprobar(j.id)}
                      disabled={operando}
                      className="text-[var(--oc-ok)]"
                    >
                      {operando ? "Aprobando…" : "Confirmar aprobación"}
                    </GreyActionPill>
                  </div>
                </div>
              )}

              {rechazando === j.id && (
                <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 p-3">
                  <p className="text-center text-xs font-extrabold text-[var(--oc-alert-text)]">
                    Motivo del rechazo (obligatorio)
                  </p>
                  <textarea
                    value={motivoRechazo}
                    onChange={(e) => setMotivoRechazo(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Documento insuficiente para justificar la falta."
                    className="w-full resize-none rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-sm font-semibold text-[var(--oc-alert-text)]"
                  />
                  <div className="flex flex-wrap justify-center gap-2">
                    <GreyActionPill
                      onClick={() => {
                        setRechazando(null);
                        setMotivoRechazo("");
                      }}
                      disabled={operando}
                    >
                      Cancelar
                    </GreyActionPill>
                    <GreyActionPill
                      onClick={() => void onRechazar(j.id)}
                      disabled={operando || !motivoRechazo.trim()}
                      className="text-[var(--oc-alert-text)]"
                    >
                      {operando ? "Rechazando…" : "Confirmar rechazo"}
                    </GreyActionPill>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {historial.length > 0 && (
        <div className="flex flex-col gap-2">
          <PanelTab className="mx-auto w-fit">Historial reciente</PanelTab>
          <ul className="flex flex-col gap-2">
            {historial.map((j) => (
              <li
                key={j.id}
                className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {j.alumnoNombre || j.curp_alumno} · {j.fecha} · {j.grado}{" "}
                    {j.grupo}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                      j.estado === "aprobada"
                        ? "bg-[var(--oc-ok)]/15 text-[var(--oc-ok)]"
                        : "bg-[var(--oc-alert)]/15 text-[var(--oc-alert-text)]"
                    }`}
                  >
                    {j.estado === "aprobada" ? "Aprobada" : "Rechazada"}
                  </span>
                </div>
                {j.motivo_rechazo && (
                  <p className="mt-1 text-xs text-[var(--oc-alert-text)]">
                    Motivo: {j.motivo_rechazo}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

