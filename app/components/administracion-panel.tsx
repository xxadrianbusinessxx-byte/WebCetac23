"use client";

/**
 * administracion-panel.tsx — las cuatro pantallas de Administración escolar del
 * directivo: Reportes, Citas, Recursos administrativos (constancias) y Buzón.
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
  actionCambiarEstadoCita,
  actionCambiarEstadoConstancia,
  actionCrearReporte,
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

function Citas({ modo }: { modo: string | null }) {
  const [lista, setLista] = useState<CitaRow[] | null>(null);
  const pendientes = (modo ?? "").toLowerCase().includes("pendiente");

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
