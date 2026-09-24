"use client";

/**
 * sesiones-programadas-panel.tsx — Perfil › Sesiones programadas, para alumno
 * y tutor.
 *
 * ── La misma entidad que «Citas» del directivo ─────────────────────────────
 * Esto no es un sistema aparte: lee la MISMA tabla `citas`. El directivo la ve
 * para resolver; el alumno y su tutor, para saber cuándo tienen que ir. Dos
 * tablas habrían sido dos fuentes del mismo dato (R6), y se habrían
 * desincronizado el día que alguien cambiara una y no la otra.
 *
 * El ALCANCE —qué citas son «las propias»— lo resuelve el servidor:
 * `actionListarCitasPropias` usa la CURP de la sesión, o la lista de
 * vinculados si quien mira es un tutor. Aquí no llega ningún identificador que
 * el navegador pueda cambiar.
 */
import { useCallback, useEffect, useState } from "react";
import {
  actionListarCitasPropias,
  actionSolicitarCita,
} from "@/app/actions/administracion";
import type { CitaRow } from "@/lib/escolar/administracion/administracion";

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });

/** Dos colores y nada más: es lo que el diseño tiene. */
const TONO: Record<string, string> = {
  aceptada: "var(--oc-ok)",
  finalizada: "var(--oc-ok)",
  rechazada: "var(--oc-alert)",
  cancelada: "var(--oc-alert)",
  pendiente: "var(--oc-muted)",
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]">
      {children}
    </p>
  );
}

export function SesionesProgramadasPanel({ curpAlumno }: { curpAlumno: string }) {
  const [lista, setLista] = useState<CitaRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ motivo: "", propuestaAt: "" });

  const cargar = useCallback(() => {
    return Promise.resolve()
      .then(() => actionListarCitasPropias())
      .then(setLista);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--oc-muted)]">
          Pedir una cita
        </h3>
        <div className="flex flex-wrap gap-3">
          <input
            placeholder="Motivo"
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            className="min-w-[14rem] flex-1 rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]"
          />
          <input
            type="datetime-local"
            value={form.propuestaAt}
            onChange={(e) => setForm({ ...form, propuestaAt: e.target.value })}
            aria-label="Fecha y hora propuesta"
            className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
          />
          <button
            type="button"
            disabled={!curpAlumno}
            onClick={() => {
              void actionSolicitarCita({
                curp: curpAlumno,
                motivo: form.motivo,
                propuestaAt: form.propuestaAt ? new Date(form.propuestaAt).toISOString() : "",
              }).then((r) => {
                setMsg(r.ok ? "Cita solicitada. Queda pendiente de aceptación." : r.error);
                if (r.ok) {
                  setForm({ motivo: "", propuestaAt: "" });
                  void cargar();
                }
              });
            }}
            className="rounded-full border border-[var(--oc-mint)] bg-[var(--oc-mint)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-navy)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Solicitar
          </button>
        </div>
        {msg && <p className="mt-3 text-xs font-semibold text-[var(--oc-muted)]">{msg}</p>}
      </div>

      {lista === null ? (
        <Aviso>Cargando tus sesiones…</Aviso>
      ) : lista.length === 0 ? (
        <Aviso>No tienes sesiones programadas.</Aviso>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-4"
            >
              <span
                aria-hidden
                className="mb-2 block h-2.5 w-2.5 rounded-full"
                style={{ background: TONO[c.estado] ?? "var(--oc-muted)" }}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-base font-bold text-[var(--oc-text)]">{fecha(c.propuesta_at)}</p>
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--oc-muted)]">
                  {c.estado}
                </span>
              </div>
              {c.motivo && <p className="mt-2 text-sm text-[var(--oc-text)]">{c.motivo}</p>}
              {c.nota_cierre && (
                <p className="mt-2 text-xs text-[var(--oc-muted)]">Nota: {c.nota_cierre}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
