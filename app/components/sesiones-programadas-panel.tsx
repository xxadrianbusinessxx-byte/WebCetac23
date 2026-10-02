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
 * vinculados si quien mira es un tutor —acotada al hijo elegido—. La CURP que se
 * pasa se comprueba allí contra ese alcance: cambiarla no enseña nada ajeno.
 *
 * ── Pedir una cita: solo en la agenda de la dirección (2026-10-01) ─────────
 * Ya no hay fecha libre. Se elige un DÍA y una HORA de los huecos que devuelve
 * `actionListarHuecosCita` (franjas del directivo, sin días bloqueados ni huecos
 * ya pedidos). Esa lista es una ayuda: quien decide es el servidor al guardar,
 * con la misma regla, y si alguien se adelantó lo dice y la lista se recarga.
 */
import { useCallback, useEffect, useState } from "react";
import {
  actionListarCitasPropias,
  actionListarHuecosCita,
  actionSolicitarCita,
} from "@/app/actions/administracion";
import type { CitaRow } from "@/lib/escolar/administracion/administracion";
import type { Hueco } from "@/lib/escolar/administracion/agenda-citas-puro";
import { ZONA_PLANTEL } from "@/lib/escolar/administracion/hora-plantel-puro";

/** En hora del PLANTEL: la cita se pidió en ella, aunque el navegador esté en otra zona. */
const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: ZONA_PLANTEL });

/** «2026-10-06» → «martes, 6 de octubre». La fecha es de calendario: se lee en UTC
 *  para que ninguna zona horaria la mueva de día. */
const nombreDia = (f: string) => {
  const [y, m, d] = f.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
};

const CLASE_CAMPO =
  "rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)] disabled:opacity-50";

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
  const [huecos, setHuecos] = useState<Hueco[]>([]);
  const [agendaPublicada, setAgendaPublicada] = useState(true);
  const [errorAgenda, setErrorAgenda] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ motivo: "", fecha: "", hora: "" });

  const cargar = useCallback(() => {
    return Promise.all([actionListarCitasPropias(curpAlumno), actionListarHuecosCita()])
      .then(([citas, agenda]) => {
        setLista(citas);
        if (agenda.ok) {
          setHuecos(agenda.huecos);
          setAgendaPublicada(agenda.agendaPublicada);
          setErrorAgenda(null);
        } else {
          setHuecos([]);
          setErrorAgenda(agenda.error);
        }
      })
      .catch(() => {
        setLista((l) => l ?? []);
        setErrorAgenda("No se pudo leer el horario de citas.");
      });
  }, [curpAlumno]);
  useEffect(() => { void cargar(); }, [cargar]);

  const dias = [...new Set(huecos.map((h) => h.fecha))];
  // Tras recargar, el día elegido puede haberse quedado sin huecos (alguien se
  // adelantó): entonces deja de estar elegido, en vez de quedar un valor que el
  // <select> ya no ofrece.
  const fechaVigente = dias.includes(form.fecha) ? form.fecha : "";
  const horasDelDia = huecos.filter((h) => h.fecha === fechaVigente).map((h) => h.hora);
  const horaVigente = horasDelDia.includes(form.hora) ? form.hora : "";
  const sinHuecos = !agendaPublicada || errorAgenda !== null || huecos.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--oc-muted)]">
          Pedir una cita
        </h3>
        {errorAgenda ? (
          <p className="mb-3 text-xs font-semibold text-[var(--oc-alert-text)]" role="alert">{errorAgenda}</p>
        ) : !agendaPublicada ? (
          <p className="mb-3 text-xs font-semibold text-[var(--oc-muted)]">
            La dirección todavía no ha publicado su horario de citas.
          </p>
        ) : huecos.length === 0 ? (
          <p className="mb-3 text-xs font-semibold text-[var(--oc-muted)]">
            No quedan horarios libres en los próximos 30 días.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <input
            placeholder="Motivo"
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            className={`min-w-[14rem] flex-1 placeholder:text-[var(--oc-muted)] ${CLASE_CAMPO}`}
          />
          <select
            value={fechaVigente}
            disabled={sinHuecos}
            onChange={(e) => setForm({ ...form, fecha: e.target.value, hora: "" })}
            aria-label="Día de la cita"
            className={CLASE_CAMPO}
          >
            <option value="">Elige el día</option>
            {dias.map((f) => (
              <option key={f} value={f}>{nombreDia(f)}</option>
            ))}
          </select>
          <select
            value={horaVigente}
            disabled={sinHuecos || !fechaVigente}
            onChange={(e) => setForm({ ...form, hora: e.target.value })}
            aria-label="Hora de la cita"
            className={CLASE_CAMPO}
          >
            <option value="">Elige la hora</option>
            {horasDelDia.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!curpAlumno || !fechaVigente || !horaVigente}
            onClick={() => {
              setMsg(null);
              void actionSolicitarCita({
                curp: curpAlumno,
                motivo: form.motivo,
                fecha: fechaVigente,
                hora: horaVigente,
              })
                .then((r) => {
                  setMsg(r.ok ? "Cita solicitada. Queda pendiente de aceptación." : r.error);
                  // Con éxito o sin él se relee: si alguien se adelantó, ese
                  // hueco ya no debe ofrecerse.
                  if (r.ok) setForm({ motivo: "", fecha: "", hora: "" });
                  void cargar();
                })
                .catch(() => setMsg("No se pudo solicitar la cita. Inténtalo de nuevo."));
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
