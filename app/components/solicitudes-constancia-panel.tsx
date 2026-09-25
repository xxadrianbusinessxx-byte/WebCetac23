"use client";

/**
 * solicitudes-constancia-panel.tsx — Perfil › Constancias de estudios, para
 * alumno y tutor (2026-09-25).
 *
 * Es el mismo sistema que «Sesiones programadas», aplicado a la constancia: se
 * pide con asunto, motivo y el día en que se pasará a recogerla, y queda
 * pendiente hasta que Administración escolar la acepta. Aquí se ve cómo va.
 *
 * El ALCANCE lo resuelve el servidor, igual que en las citas: la lista es la de
 * la CURP de la sesión o la de los vinculados del tutor, y al pedir, la CURP
 * tiene que estar en ese alcance. Toda llamada maneja su error: un fallo termina
 * en un mensaje, nunca en un «cargando» eterno.
 */
import { useCallback, useEffect, useState } from "react";
import {
  actionListarConstanciasPropias,
  actionSolicitarConstancia,
} from "@/app/actions/administracion";
import type { ConstanciaRow } from "@/lib/escolar/administracion/administracion";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-09-30» → «30 de septiembre de 2026», sin pasar por la zona horaria. */
function diaLargo(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : "—";
}

/** Mañana, como valor mínimo del selector de día. */
function manana(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ESTADO: Record<string, { tono: string; texto: (c: ConstanciaRow) => string }> = {
  pendiente: { tono: "var(--oc-muted)", texto: () => "En revisión por Administración escolar." },
  aceptada: { tono: "var(--oc-ok)", texto: (c) => `Aceptada. Pasa a recogerla el ${diaLargo(c.fecha_recogida)}.` },
  entregada: { tono: "var(--oc-ok)", texto: () => "Entregada." },
  rechazada: { tono: "var(--oc-alert)", texto: () => "Rechazada. Acude a Administración escolar." },
  anulada: { tono: "var(--oc-alert)", texto: () => "Anulada." },
};

/** Clase y no componente: un `Aviso` más sería otra copia de una pieza que ya
 *  existe en varios archivos (C11). */
const AVISO =
  "rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]";

const CAMPO =
  "rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]";

export function SolicitudesConstanciaPanel({ curpAlumno }: { curpAlumno: string }) {
  const [lista, setLista] = useState<ConstanciaRow[] | null>(null);
  const [errorLista, setErrorLista] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({ asunto: "", motivo: "", fechaRecogida: "" });

  const cargar = useCallback(() => {
    return Promise.resolve()
      .then(() => actionListarConstanciasPropias())
      .then((l) => {
        setLista(l);
        setErrorLista(false);
      })
      .catch(() => setErrorLista(true));
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function solicitar() {
    setEnviando(true);
    setMsg(null);
    try {
      const r = await actionSolicitarConstancia({ curp: curpAlumno, ...form });
      if (r.ok) {
        setMsg("Constancia solicitada. Queda pendiente de que Administración escolar la acepte.");
        setForm({ asunto: "", motivo: "", fechaRecogida: "" });
        void cargar();
      } else {
        setMsg(r.error);
      }
    } catch {
      setMsg("No se pudo enviar la solicitud. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  // Las de ESTE alumno: el tutor puede tener varios vinculados.
  const propias = lista?.filter((c) => c.curp === curpAlumno) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--oc-muted)]">
          Pedir una constancia de estudios
        </h3>
        <div className="flex flex-col gap-3">
          <input
            placeholder="Asunto (por ejemplo: trámite de beca)"
            value={form.asunto}
            maxLength={120}
            onChange={(e) => setForm({ ...form, asunto: e.target.value })}
            className={`${CAMPO} w-full`}
          />
          <textarea
            placeholder="Motivo"
            value={form.motivo}
            maxLength={500}
            rows={3}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            className={`${CAMPO} w-full resize-y`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--oc-muted)]">
              Día para recogerla
              <input
                type="date"
                min={manana()}
                value={form.fechaRecogida}
                onChange={(e) => setForm({ ...form, fechaRecogida: e.target.value })}
                className={CAMPO}
              />
            </label>
            <button
              type="button"
              disabled={!curpAlumno || enviando}
              onClick={() => void solicitar()}
              className="ml-auto rounded-full border border-[var(--oc-mint)] bg-[var(--oc-mint)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-navy)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Solicitar"}
            </button>
          </div>
          <p className="text-[11px] text-[var(--oc-muted)]">
            De lunes a viernes, a partir de mañana. Administración escolar confirma la solicitud.
          </p>
        </div>
        {msg && <p className="mt-3 text-xs font-semibold text-[var(--oc-muted)]">{msg}</p>}
      </div>

      {errorLista ? (
        <p className={AVISO}>No se pudieron cargar tus solicitudes. Recarga la página para intentarlo de nuevo.</p>
      ) : propias === null ? (
        <p className={AVISO}>Cargando tus solicitudes…</p>
      ) : propias.length === 0 ? (
        <p className={AVISO}>No has pedido ninguna constancia en este ciclo.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {propias.map((c) => {
            const e = ESTADO[c.estado] ?? ESTADO.pendiente!;
            return (
              <div key={c.id} className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-4">
                <span aria-hidden className="mb-2 block h-2.5 w-2.5 rounded-full" style={{ background: e.tono }} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-base font-bold text-[var(--oc-text)]">{c.asunto || "Constancia de estudios"}</p>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--oc-muted)]">{c.estado}</span>
                </div>
                {c.motivo && <p className="mt-2 text-sm text-[var(--oc-text)]">{c.motivo}</p>}
                <p className="mt-2 text-xs text-[var(--oc-muted)]">Para recoger el {diaLargo(c.fecha_recogida)}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--oc-text)]">{e.texto(c)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
