"use client";

/**
 * administracion-panel.tsx — las cuatro pantallas de Administración escolar del
 * directivo: Reportes, Citas, Recursos administrativos (constancias) y Buzón.
 * Citas tiene tres vistas por modo; «Configurar citas» es la agenda de la
 * dirección (2026-10-01): en qué días y horas recibe citas.
 *
 * Sustituyen a las MAQUETAS de `maquetas-oceano.tsx`, que dibujaban estas
 * mismas pantallas sin datos. La forma se conserva —es la del diseño— y lo que
 * cambia es que ahora los controles operan.
 *
 * ── Qué NO hace este archivo ───────────────────────────────────────────────
 * No decide permisos ni alcance: llama a actions que ya exigen su capacidad y
 * resuelven de quién es cada cosa. Tampoco decide transiciones de estado — eso
 * vive en `flujos-puro` y el servidor lo rechaza si no vale, así que la UI
 * ofrece lo que el estado permite y confía en la comprobación de atrás.
 */
import { useCallback, useEffect, useState } from "react";
import {
  actionAnularReporte,
  actionBloquearDia,
  actionBorrarFranja,
  actionCambiarEstadoCita,
  actionCambiarEstadoConstancia,
  actionCrearReporte,
  actionDesbloquearDia,
  actionGuardarFranja,
  actionLeerAgendaCitas,
  actionListarBuzon,
  actionListarCitas,
  actionListarConstancias,
  actionListarReportes,
  actionMarcarBuzonLeido,
} from "@/app/actions/administracion";
import type {
  BuzonRow,
  CitaRow,
  ConstanciaConAlumno,
  ReporteRow,
} from "@/lib/escolar/administracion/administracion";
import {
  DURACIONES_CITA,
  NOMBRE_DIA,
  type DiaBloqueado,
  type Franja,
} from "@/lib/escolar/administracion/agenda-citas-puro";
import { DIAS_SEMANA } from "@/lib/escolar/ciclo/calendario";
import { vistaCitas } from "@/lib/navegacion/contenido-directivo";

/* ── Piezas compartidas, con los tokens del diseño ─────────────────────── */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6">
      {children}
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-2xl font-bold tracking-tight text-[var(--oc-text)]">{children}</h2>;
}

function Boton({
  children,
  onClick,
  primario,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primario?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${
        primario
          ? "border-[var(--oc-mint)] bg-[var(--oc-mint)] text-[var(--oc-navy)]"
          : "border-[var(--oc-border)] bg-[var(--oc-input)] text-[var(--oc-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function Campo(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={`rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)] ${p.className ?? ""}`}
    />
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]">
      {children}
    </p>
  );
}

/** Punto de color por estado. El diseño usa DOS colores semánticos y nada más:
 *  no se inventa un ámbar ni un azul para estados intermedios. */
function Punto({ tono }: { tono: "ok" | "alerta" | "neutro" }) {
  const color =
    tono === "ok" ? "var(--oc-ok)" : tono === "alerta" ? "var(--oc-alert)" : "var(--oc-muted)";
  return <span aria-hidden className="mb-2 block h-2.5 w-2.5 rounded-full" style={{ background: color }} />;
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—";

/* ── Reportes disciplinarios ───────────────────────────────────────────── */

/** El alumno sobre el que se trabaja. `undefined` = la pantalla del directivo,
 *  que escribe la CURP; con valor (o null) = Administración escolar, que lo
 *  eligió en el buscador del expediente. */
type AlumnoElegido = { curp: string; nombre: string } | null | undefined;

function Reportes({ modo, alumno }: { modo: string | null; alumno?: AlumnoElegido }) {
  const [lista, setLista] = useState<ReporteRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ curp: "", motivo: "", gravedad: "leve", ocurridoAt: "" });
  const [soloDelAlumno, setSoloDelAlumno] = useState(true);
  const conBuscador = alumno !== undefined;

  const cargar = useCallback(() => {
    return Promise.resolve()
      .then(() => actionListarReportes())
      .then(setLista);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  if ((modo ?? "").startsWith("Crea")) {
    if (conBuscador && !alumno) {
      return (
        <>
          <Titulo>Reportes</Titulo>
          <Aviso>Busca al alumno en el panel de la izquierda para elaborar su reporte.</Aviso>
        </>
      );
    }
    return (
      <>
        <Titulo>Reportes</Titulo>
        <Panel>
          <div className="flex flex-col gap-4">
            {alumno ? (
              <p className="text-sm text-[var(--oc-text)]">
                Reporte para <strong>{alumno.nombre || alumno.curp}</strong>
                <span className="text-[var(--oc-muted)]"> · {alumno.curp}</span>
              </p>
            ) : (
              <Campo
                placeholder="CURP del alumno"
                value={form.curp}
                onChange={(e) => setForm({ ...form, curp: e.target.value })}
                className="w-full max-w-md"
              />
            )}
            <textarea
              placeholder="Motivo del reporte"
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              rows={4}
              className="w-full max-w-xl rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-sm text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Campo
                type="datetime-local"
                value={form.ocurridoAt}
                onChange={(e) => setForm({ ...form, ocurridoAt: e.target.value })}
                aria-label="Fecha y hora del reporte"
              />
              <select
                value={form.gravedad}
                onChange={(e) => setForm({ ...form, gravedad: e.target.value })}
                aria-label="Gravedad"
                className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
              >
                <option value="leve">Leve</option>
                <option value="media">Media</option>
                <option value="grave">Grave</option>
              </select>
            </div>
            {msg && <Aviso>{msg}</Aviso>}
            <div className="flex justify-end">
              <Boton
                primario
                onClick={() => {
                  void actionCrearReporte({
                    curp: alumno ? alumno.curp : form.curp,
                    grupoId: null,
                    motivo: form.motivo,
                    gravedad: form.gravedad,
                    ocurridoAt: form.ocurridoAt ? new Date(form.ocurridoAt).toISOString() : "",
                  }).then((r) => {
                    setMsg(r.ok ? "Reporte registrado." : r.error);
                    if (r.ok) {
                      setForm({ curp: "", motivo: "", gravedad: "leve", ocurridoAt: "" });
                      void cargar();
                    }
                  });
                }}
              >
                Confirmar
              </Boton>
            </div>
          </div>
        </Panel>
      </>
    );
  }

  // Con un alumno abierto se enseñan SUS reportes; el conmutador vuelve a todos.
  const filtrar = Boolean(alumno) && soloDelAlumno;
  const visibles = lista && filtrar ? lista.filter((r) => r.curp === alumno!.curp) : lista;

  return (
    <>
      <Titulo>Reportes</Titulo>
      {alumno && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--oc-muted)]">
            {filtrar ? `Reportes de ${alumno.nombre || alumno.curp}` : "Todos los reportes del ciclo"}
          </p>
          <Boton onClick={() => setSoloDelAlumno(!soloDelAlumno)}>
            {filtrar ? "Ver todos" : "Solo este alumno"}
          </Boton>
        </div>
      )}
      <Panel>
        {visibles === null ? (
          <Aviso>Cargando reportes…</Aviso>
        ) : visibles.length === 0 ? (
          <Aviso>{filtrar ? "Este alumno no tiene reportes en el ciclo." : "No hay reportes en este ciclo."}</Aviso>
        ) : (
          <div className="flex flex-col gap-3">
            {visibles.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-4"
              >
                <Punto tono={r.anulado_at ? "neutro" : r.gravedad === "grave" ? "alerta" : "ok"} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-base font-bold text-[var(--oc-text)]">{r.curp}</p>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--oc-muted)]">
                    {r.gravedad}
                    {r.anulado_at ? " · anulado" : ""}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--oc-text)]">{r.motivo}</p>
                <p className="mt-1 text-xs text-[var(--oc-muted)]">{fecha(r.ocurrido_at)}</p>
                {/* Anular no se ofrece dos veces: el servidor lo rechazaría, y
                    un botón que el servidor rechaza es un botón que miente. */}
                {!r.anulado_at && (
                  <div className="mt-3 flex justify-end">
                    <Boton
                      onClick={() => {
                        void actionAnularReporte(r.id).then(() => cargar());
                      }}
                    >
                      Anular
                    </Boton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

/* ── Citas ─────────────────────────────────────────────────────────────── */

/** Tres vistas sobre el mismo hueco; cuál, lo decide `vistaCitas` con el rótulo. */
function Citas({ modo }: { modo: string | null }) {
  const vista = vistaCitas(modo);
  if (vista === "configurar") return <AgendaCitas />;
  return <ListaCitas pendientes={vista === "pendientes"} />;
}

function ListaCitas({ pendientes }: { pendientes: boolean }) {
  const [lista, setLista] = useState<CitaRow[] | null>(null);

  const cargar = useCallback(() => {
    return Promise.resolve()
      .then(() => actionListarCitas())
      .then(setLista);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = (lista ?? []).filter((c) =>
    pendientes ? c.estado === "pendiente" : c.estado !== "pendiente",
  );

  const cambiar = (id: string, estado: string) => {
    void actionCambiarEstadoCita(id, estado).then(() => cargar());
  };

  return (
    <>
      <Titulo>{pendientes ? "Citas pendientes" : "Citas programadas"}</Titulo>
      <Panel>
        {lista === null ? (
          <Aviso>Cargando citas…</Aviso>
        ) : visibles.length === 0 ? (
          <Aviso>{pendientes ? "No hay citas pendientes." : "No hay citas programadas."}</Aviso>
        ) : (
          <div className="flex flex-col gap-3">
            {visibles.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-4"
              >
                <Punto tono={c.estado === "aceptada" ? "ok" : c.estado === "rechazada" ? "alerta" : "neutro"} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-base font-bold text-[var(--oc-text)]">{c.curp}</p>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--oc-muted)]">
                    {c.estado} · pide {c.solicitada_por}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--oc-muted)]">{fecha(c.propuesta_at)}</p>
                {c.motivo && <p className="mt-2 text-sm text-[var(--oc-text)]">{c.motivo}</p>}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {/* Solo se ofrece lo que la máquina de estados permite desde
                      aquí. Las transiciones las valida el servidor igualmente. */}
                  {c.estado === "pendiente" && (
                    <>
                      <Boton primario onClick={() => cambiar(c.id, "aceptada")}>Aceptar</Boton>
                      <Boton onClick={() => cambiar(c.id, "rechazada")}>Rechazar</Boton>
                    </>
                  )}
                  {c.estado === "aceptada" && (
                    <Boton onClick={() => cambiar(c.id, "finalizada")}>Marcar como finalizada</Boton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

/* ── Agenda de citas (2026-10-01) ──────────────────────────────────────── */

const CLASE_SELECT =
  "rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]";

type AgendaPantalla = { franjas: Franja[]; diasBloqueados: DiaBloqueado[]; huecosLibres: number };
type Respuesta = { ok: true } | { ok: false; error: string };

/**
 * «Configurar citas»: el horario semanal en que la dirección recibe citas y los
 * días concretos en que no. Alumno y tutor solo pueden pedir dentro de esto. La
 * pantalla no valida nada: si una franja se cruza o no cabe, lo dice el servidor
 * (`validarFranja`) y aquí se enseña su mensaje.
 */
function AgendaCitas() {
  const [agenda, setAgenda] = useState<AgendaPantalla | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [franja, setFranja] = useState({ diaSemana: "lunes", horaInicio: "09:00", horaFin: "13:00", duracionMin: "30" });
  const [bloqueo, setBloqueo] = useState({ fecha: "", motivo: "" });

  const cargar = useCallback(() => {
    return Promise.resolve()
      .then(() => actionLeerAgendaCitas())
      .then((r) => {
        if (r.ok) {
          setAgenda({ franjas: r.franjas, diasBloqueados: r.diasBloqueados, huecosLibres: r.huecosLibres });
          setError(null);
        } else {
          setAgenda(null);
          setError(r.error);
        }
      })
      .catch(() => setError("No se pudo leer la agenda de citas."));
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  /** Ejecuta, enseña el resultado y relee: la agenda que se ve es siempre la guardada. */
  const hacer = (accion: () => Promise<Respuesta>, exito: string, alTerminar?: () => void) => {
    setMsg(null);
    void accion()
      .then((r) => {
        setMsg(r.ok ? exito : r.error);
        if (r.ok) alTerminar?.();
        return cargar();
      })
      .catch(() => setMsg("No se pudo guardar. Inténtalo de nuevo."));
  };

  if (agenda === null) {
    return (
      <>
        <Titulo>Configurar citas</Titulo>
        <Aviso>{error ?? "Cargando la agenda…"}</Aviso>
      </>
    );
  }

  const publicada = agenda.franjas.length > 0;

  return (
    <>
      <Titulo>Configurar citas</Titulo>
      <div className="mb-4">
        <Aviso>
          {publicada
            ? `Agenda publicada: ${agenda.huecosLibres} huecos libres en los próximos 30 días.`
            : "Sin horario: alumnos y tutores no pueden pedir citas hasta que añadas uno."}
        </Aviso>
      </div>
      {msg && (
        <div className="mb-4">
          <Aviso>{msg}</Aviso>
        </div>
      )}

      <Panel>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--oc-muted)]">Horario de atención</h3>
        <div className="flex flex-col gap-2">
          {DIAS_SEMANA.map((d) => {
            const delDia = agenda.franjas.filter((f) => f.dia_semana === d);
            return (
              <div
                key={d}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2"
              >
                <span className="w-24 text-sm font-bold capitalize text-[var(--oc-text)]">{NOMBRE_DIA[d]}</span>
                {delDia.length === 0 ? (
                  <span className="text-xs text-[var(--oc-muted)]">Sin atención</span>
                ) : (
                  delDia.map((f) => (
                    <span key={f.id} className="flex items-center gap-2 text-sm text-[var(--oc-text)]">
                      {f.hora_inicio}–{f.hora_fin} · citas de {f.duracion_min} min
                      <Boton onClick={() => hacer(() => actionBorrarFranja({ id: f.id }), "Horario quitado.")}>
                        Quitar
                      </Boton>
                    </span>
                  ))
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={franja.diaSemana}
            onChange={(e) => setFranja({ ...franja, diaSemana: e.target.value })}
            aria-label="Día de la semana"
            className={CLASE_SELECT}
          >
            {DIAS_SEMANA.map((d) => (
              <option key={d} value={d}>{NOMBRE_DIA[d]}</option>
            ))}
          </select>
          <Campo
            type="time"
            value={franja.horaInicio}
            onChange={(e) => setFranja({ ...franja, horaInicio: e.target.value })}
            aria-label="Desde"
          />
          <Campo
            type="time"
            value={franja.horaFin}
            onChange={(e) => setFranja({ ...franja, horaFin: e.target.value })}
            aria-label="Hasta"
          />
          <select
            value={franja.duracionMin}
            onChange={(e) => setFranja({ ...franja, duracionMin: e.target.value })}
            aria-label="Duración de cada cita"
            className={CLASE_SELECT}
          >
            {DURACIONES_CITA.map((m) => (
              <option key={m} value={String(m)}>Citas de {m} min</option>
            ))}
          </select>
          <Boton primario onClick={() => hacer(() => actionGuardarFranja(franja), "Horario añadido.")}>
            Añadir horario
          </Boton>
        </div>
      </Panel>

      <div className="mt-4">
        <Panel>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--oc-muted)]">Días sin atención</h3>
          {agenda.diasBloqueados.length === 0 ? (
            <Aviso>No hay días bloqueados.</Aviso>
          ) : (
            <div className="flex flex-col gap-2">
              {agenda.diasBloqueados.map((d) => (
                <div
                  key={d.fecha}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2"
                >
                  <span className="text-sm text-[var(--oc-text)]">
                    <strong>{dia(d.fecha)}</strong>
                    {d.motivo && <span className="text-[var(--oc-muted)]"> · {d.motivo}</span>}
                  </span>
                  <Boton onClick={() => hacer(() => actionDesbloquearDia({ fecha: d.fecha }), "Día desbloqueado.")}>
                    Quitar
                  </Boton>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Campo
              type="date"
              value={bloqueo.fecha}
              onChange={(e) => setBloqueo({ ...bloqueo, fecha: e.target.value })}
              aria-label="Día sin atención"
            />
            <Campo
              placeholder="Motivo (opcional)"
              value={bloqueo.motivo}
              onChange={(e) => setBloqueo({ ...bloqueo, motivo: e.target.value })}
              className="min-w-[14rem] flex-1"
            />
            <Boton
              primario
              disabled={!bloqueo.fecha}
              onClick={() =>
                hacer(() => actionBloquearDia(bloqueo), "Día bloqueado.", () => setBloqueo({ fecha: "", motivo: "" }))
              }
            >
              Bloquear día
            </Boton>
          </div>
        </Panel>
      </div>
    </>
  );
}

/* ── Recursos administrativos (constancias) ────────────────────────────── */

/** «2026-09-30» → «30/09/2026», sin pasar por la zona horaria. */
const dia = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

/**
 * Solicitudes de constancia de estudios. Desde el 2026-09-25 las piden alumno y
 * tutor desde su perfil (asunto, motivo, día para recogerla) y SOLO Administración
 * escolar las acepta: el servidor exige `constancia.gestionar`, que ya no tiene
 * Dirección. Pendientes primero, por día de recogida: es el orden en que se
 * preparan.
 */
function Constancias() {
  const [lista, setLista] = useState<ConstanciaConAlumno[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(() => {
    return Promise.resolve()
      .then(() => actionListarConstancias())
      .then(setLista)
      .catch(() => {
        setLista([]);
        setMsg("No se pudieron cargar las solicitudes. Inténtalo de nuevo.");
      });
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const cambiar = (id: string, estado: string) => {
    setMsg(null);
    void actionCambiarEstadoConstancia(id, estado)
      .then((r) => {
        if (!r.ok) setMsg(r.error);
        return cargar();
      })
      .catch(() => setMsg("No se pudo cambiar el estado. Inténtalo de nuevo."));
  };

  const orden = (c: ConstanciaConAlumno) => (c.estado === "pendiente" ? 0 : c.estado === "aceptada" ? 1 : 2);
  const ordenada = lista
    ? [...lista].sort((a, b) => orden(a) - orden(b) || (a.fecha_recogida ?? "").localeCompare(b.fecha_recogida ?? ""))
    : null;

  return (
    <>
      <Titulo>Solicitudes de constancia</Titulo>
      {msg && <Aviso>{msg}</Aviso>}
      <Panel>
        {ordenada === null ? (
          <Aviso>Cargando solicitudes…</Aviso>
        ) : ordenada.length === 0 ? (
          <Aviso>No hay solicitudes de constancia en este ciclo.</Aviso>
        ) : (
          <div className="flex flex-col gap-3">
            {ordenada.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-4"
              >
                <Punto tono={c.estado === "entregada" || c.estado === "aceptada" ? "ok" : c.estado === "rechazada" || c.estado === "anulada" ? "alerta" : "neutro"} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-base font-bold text-[var(--oc-text)]">{c.nombre_alumno || c.curp}</p>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--oc-muted)]">
                    {c.estado}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--oc-muted)]">
                  {c.curp} · pedida {c.solicitada_por ? `por ${c.solicitada_por}` : ""} el {fecha(c.created_at)}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--oc-text)]">{c.asunto || c.tipo}</p>
                {c.motivo && <p className="mt-1 text-sm text-[var(--oc-text)]">{c.motivo}</p>}
                {c.observaciones && <p className="mt-1 text-sm text-[var(--oc-text)]">{c.observaciones}</p>}
                <p className="mt-2 text-xs font-semibold text-[var(--oc-muted)]">
                  Para recoger el {dia(c.fecha_recogida)}
                </p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {c.estado === "pendiente" && (
                    <>
                      <Boton primario onClick={() => cambiar(c.id, "aceptada")}>Aceptar</Boton>
                      <Boton onClick={() => cambiar(c.id, "rechazada")}>Rechazar</Boton>
                    </>
                  )}
                  {c.estado === "aceptada" && (
                    <>
                      <Boton primario onClick={() => cambiar(c.id, "entregada")}>Marcar entregada</Boton>
                      <Boton onClick={() => cambiar(c.id, "anulada")}>Anular</Boton>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

/* ── Buzón ─────────────────────────────────────────────────────────────── */

function Buzon({ modo }: { modo: string | null }) {
  const [lista, setLista] = useState<BuzonRow[] | null>(null);
  // El diseño da dos modos. «comentarios» es el explícito; lo demás, quejas.
  const tipo = (modo ?? "").toLowerCase().includes("comentario") ? "comentario" : "queja";

  const cargar = useCallback(() => {
    return Promise.resolve()
      .then(() => actionListarBuzon(tipo))
      .then(setLista);
  }, [tipo]);
  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <>
      <Titulo>Buzón</Titulo>
      <Panel>
        {lista === null ? (
          <Aviso>Cargando el buzón…</Aviso>
        ) : lista.length === 0 ? (
          <Aviso>No hay {tipo === "queja" ? "quejas" : "comentarios"}.</Aviso>
        ) : (
          <div className="flex flex-col gap-3">
            {lista.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-4"
              >
                <Punto tono={m.leido_at ? "neutro" : "alerta"} />
                <p className="text-lg font-semibold text-[var(--oc-text)]">
                  {/* Sin CURP es ANÓNIMO de verdad: no se guardó. Decirlo aquí
                      evita que alguien lo lea como «falta el dato». */}
                  {m.curp ?? `${m.remitente} (anónimo)`}
                </p>
                <p className="mt-2 text-sm text-[var(--oc-muted)]">{m.mensaje}</p>
                <p className="mt-1 text-xs text-[var(--oc-muted)]">{fecha(m.created_at)}</p>
                {!m.leido_at && (
                  <div className="mt-3 flex justify-end">
                    <Boton
                      onClick={() => {
                        void actionMarcarBuzonLeido(m.id).then(() => cargar());
                      }}
                    >
                      Marcar atendido
                    </Boton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

/* ── Despachador ───────────────────────────────────────────────────────── */

export type PantallaAdministracion = "reportes" | "citas" | "constancias" | "buzon";

export function AdministracionPanel({
  pantalla,
  modo,
  alumno,
}: {
  pantalla: PantallaAdministracion;
  modo: string | null;
  /** Solo Administración escolar: el alumno elegido en su buscador (o null). */
  alumno?: AlumnoElegido;
}) {
  switch (pantalla) {
    case "reportes":
      return <Reportes modo={modo} alumno={alumno} />;
    case "citas":
      return <Citas modo={modo} />;
    case "constancias":
      return <Constancias />;
    case "buzon":
      return <Buzon modo={modo} />;
  }
}
