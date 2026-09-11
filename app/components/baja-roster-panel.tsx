"use client";

// PROMPT-4/T3 — Baja/restauración de roster (previsualizar → confirmar).
// Sacar a un alumno del roster es una DECISIÓN HUMANA (T1): activo=false +
// decision_manual=true. NO borra al alumno de ALUMNOS ni su historial: la
// previsualización cuenta qué arrastra (asistencia, justificaciones, materias
// con filas) para que no se descubra después.
import { useState } from "react";
import {
  actionConfirmarBajaRoster,
  actionPrevisualizarBajaRoster,
  actionRestaurarEnRoster,
} from "@/app/actions/escolar";
import type { PreviewBajaRoster } from "@/lib/escolar/catalogo/roster-borrado";

type Mensaje = { ok: boolean; texto: string } | null;

export function BajaRosterPanel() {
  const [curp, setCurp] = useState("");
  const [preview, setPreview] = useState<PreviewBajaRoster | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje>(null);

  async function previsualizar() {
    const c = curp.trim().toUpperCase();
    if (!c) return;
    setBuscando(true);
    setMensaje(null);
    setPreview(null);
    const r = await actionPrevisualizarBajaRoster(c);
    setBuscando(false);
    if (!r) {
      setMensaje({ ok: false, texto: "No autorizado." });
      return;
    }
    if (!r.estaEnRoster) {
      setMensaje({
        ok: false,
        texto: `${r.curp}${r.nombre ? ` (${r.nombre})` : ""} NO tiene inscripción ACTIVA en el ciclo operativo.`,
      });
      return;
    }
    setPreview(r);
  }

  async function confirmarBaja() {
    if (!preview) return;
    setTrabajando(true);
    setMensaje(null);
    const r = await actionConfirmarBajaRoster(preview.curp);
    setTrabajando(false);
    setMensaje({ ok: r.ok, texto: r.ok ? r.mensaje : r.error });
    if (r.ok) {
      setPreview(null);
      setCurp("");
    }
  }

  async function restaurar() {
    const c = curp.trim().toUpperCase();
    if (!c) return;
    setTrabajando(true);
    setMensaje(null);
    const r = await actionRestaurarEnRoster(c);
    setTrabajando(false);
    setMensaje({ ok: r.ok, texto: r.ok ? r.mensaje : r.error });
    if (r.ok) setCurp("");
  }

  return (
    <div className="mt-10 w-full rounded-[1.5rem] border border-[var(--oc-border)] bg-[var(--oc-surface)] p-5 ">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
        Baja de roster
      </h2>
      <p className="mt-1 text-xs font-semibold text-[var(--oc-muted)]">
        Sacar a un alumno del roster del ciclo = decisión humana: queda con
        <code> activo=false + decision_manual=true</code> (la reactivación no lo
        devuelve). No borra de ALUMNOS ni su historial. Previsualiza antes.
      </p>

      {mensaje && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${
            mensaje.ok
              ? "bg-[var(--oc-ok)]/15 text-[var(--oc-ok)]"
              : "bg-[var(--oc-alert)]/15 text-[var(--oc-alert-text)]"
          }`}
          role="status"
        >
          {mensaje.texto}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={curp}
          onChange={(e) => {
            setCurp(e.target.value.toUpperCase());
            setPreview(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && void previsualizar()}
          placeholder="CURP del alumno…"
          className="w-64 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-xs font-bold text-[var(--oc-muted)] outline-none"
        />
        <button
          type="button"
          disabled={buscando || trabajando || !curp.trim()}
          onClick={() => void previsualizar()}
          className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-105 disabled:opacity-60"
        >
          {buscando ? "Buscando…" : "Previsualizar baja"}
        </button>
        <button
          type="button"
          disabled={trabajando || !curp.trim()}
          onClick={() => void restaurar()}
          className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-105 disabled:opacity-60"
        >
          {trabajando ? "Guardando…" : "Restaurar en roster"}
        </button>
      </div>

      {preview && (
        <div className="mt-4 rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 p-4">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[var(--oc-alert-text)]">
            Previsualización
          </p>
          <ul className="flex flex-col gap-1 text-xs font-semibold text-[var(--oc-alert-text)]">
            <li>
              Alumno: {preview.nombre ?? preview.curp} ({preview.curp})
            </li>
            <li>Grupo: {preview.grupoDescripcion ?? "—"}</li>
            <li>
              Asistencia registrada (se conserva): {preview.asistenciaRegistrada}{" "}
              filas
            </li>
            <li>
              Justificaciones (se conservan): {preview.justificaciones}
            </li>
            <li>
              Materias del grupo con filas (se conservan):{" "}
              {preview.materiasConFilas.length > 0
                ? preview.materiasConFilas.join(", ")
                : "ninguna"}
            </li>
          </ul>
          <p className="mt-2 text-[11px] font-semibold text-[var(--oc-alert-text)]">
            Al confirmar, el alumno deja de pertenecer al grupo en este ciclo.
            Su fila en ALUMNOS y todo su historial permanecen.
          </p>
          <button
            type="button"
            disabled={trabajando}
            onClick={() => void confirmarBaja()}
            className="mt-3 rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-105 disabled:opacity-60"
          >
            {trabajando ? "Aplicando…" : "Confirmar baja"}
          </button>
        </div>
      )}
    </div>
  );
}

