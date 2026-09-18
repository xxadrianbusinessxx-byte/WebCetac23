"use client";

/**
 * actividades-panel.tsx — Materias › Actividades.
 *
 * Dos caras de la misma pantalla, según quién mira:
 *   · alumno y tutor → las tarjetas del diseño, con el estado en color, y el
 *     alumno además puede entregar;
 *   · maestro y directivo → lo mismo, más la caja de crear actividad.
 *
 * Lo decide `puedeEditar`, que llega RESUELTO del servidor con la misma
 * `puede()` de la matriz. Este componente no pregunta por el rol: si
 * preguntara, habría dos sitios decidiendo permisos.
 *
 * ── El estado no se guarda ─────────────────────────────────────────────────
 * ACTIVA / VENCIDA se DERIVA aquí con `estadoActividad(actividad, ahora)`, del
 * módulo puro. No hay columna `estado` en la base, y por eso no puede quedarse
 * obsoleta: se recalcula cada vez que se pinta.
 */
import { useCallback, useEffect, useState } from "react";
import {
  actionCrearActividad,
  actionEliminarActividad,
  actionEntregarActividad,
  actionVistaActividades,
} from "@/app/actions/actividades";
import type { ActividadRow, EntregaRow } from "@/lib/escolar/materia/actividades";
import {
  estadoActividad,
  ordenarParaAlumno,
  pesosCuadran,
  totalPesos,
  type EstadoActividad,
} from "@/lib/escolar/materia/actividades-puro";

const TONO: Record<EstadoActividad, string> = {
  activa: "var(--oc-ok)",
  vencida: "var(--oc-alert)",
  // Sin fecha NO es ni activa ni vencida: se pinta neutro para que se vea que
  // le falta el plazo, no para esconderlo.
  "sin-fecha": "var(--oc-muted)",
};

const ROTULO: Record<EstadoActividad, string> = {
  activa: "ACTIVA",
  vencida: "VENCIDA",
  "sin-fecha": "SIN FECHA",
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]">
      {children}
    </p>
  );
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

export function ActividadesPanel({
  materiaInterna,
  nombreVisible,
  puedeEditar,
  puedeEntregar,
}: {
  materiaInterna: string;
  nombreVisible: string;
  /** Resuelto en el servidor con `puede(rol, "actividad.editar")`. */
  puedeEditar: boolean;
  /** Resuelto en el servidor con `puede(rol, "actividad.entregar")`. */
  puedeEntregar: boolean;
}) {
  const [datos, setDatos] = useState<{ actividades: ActividadRow[]; entregas: EntregaRow[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nueva, setNueva] = useState({ titulo: "", descripcion: "", fechaLimite: "", peso: "" });

  const cargar = useCallback(() => {
    if (!materiaInterna) return Promise.resolve();
    return Promise.resolve()
      .then(() => actionVistaActividades(materiaInterna))
      .then(setDatos);
  }, [materiaInterna]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (!materiaInterna) return <Aviso>Elige una materia para ver sus actividades.</Aviso>;
  if (datos === null) return <Aviso>Cargando actividades…</Aviso>;

  // `ahora` se calcula UNA vez por render y se pasa a la función pura: así
  // todas las tarjetas se juzgan contra el mismo instante.
  const ahora = new Date();
  const ordenadas = ordenarParaAlumno(datos.actividades, ahora);
  const entregadas = new Set(datos.entregas.map((e) => e.actividad_id));
  const total = totalPesos(datos.actividades);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--oc-text)]">{nombreVisible}</h2>
        {datos.actividades.length > 0 && (
          <span className="text-sm font-semibold text-[var(--oc-muted)]">
            {/* El total se enseña siempre, cuadre o no: si no suma 100 el
                profesor tiene que poder verlo, no que se le oculte. */}
            Pesos: {total}%{pesosCuadran(datos.actividades) ? "" : " (no suman 100)"}
          </span>
        )}
      </div>

      {msg && <Aviso>{msg}</Aviso>}

      {puedeEditar && (
        <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--oc-muted)]">
            Nueva actividad
          </h3>
          <div className="flex flex-wrap gap-3">
            <input
              placeholder="Título"
              value={nueva.titulo}
              onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })}
              className="min-w-[14rem] flex-1 rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]"
            />
            <input
              type="datetime-local"
              value={nueva.fechaLimite}
              onChange={(e) => setNueva({ ...nueva, fechaLimite: e.target.value })}
              aria-label="Fecha límite"
              className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
            />
            <input
              type="number"
              placeholder="Peso %"
              value={nueva.peso}
              onChange={(e) => setNueva({ ...nueva, peso: e.target.value })}
              className="w-28 rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]"
            />
          </div>
          <textarea
            placeholder="Descripción de la actividad"
            value={nueva.descripcion}
            onChange={(e) => setNueva({ ...nueva, descripcion: e.target.value })}
            rows={3}
            className="mt-3 w-full rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-sm text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]"
          />
          <div className="mt-3 flex justify-end">
            <Boton
              primario
              onClick={() => {
                void actionCrearActividad({
                  materiaInterna,
                  titulo: nueva.titulo,
                  descripcion: nueva.descripcion,
                  fechaLimite: nueva.fechaLimite ? new Date(nueva.fechaLimite).toISOString() : null,
                  peso: nueva.peso ? Number(nueva.peso) : null,
                }).then((r) => {
                  setMsg(r.ok ? null : r.error);
                  if (r.ok) {
                    setNueva({ titulo: "", descripcion: "", fechaLimite: "", peso: "" });
                    void cargar();
                  }
                });
              }}
            >
              Crear actividad
            </Boton>
          </div>
        </div>
      )}

      {ordenadas.length === 0 ? (
        <Aviso>Esta materia todavía no tiene actividades.</Aviso>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordenadas.map((a) => {
            const estado = estadoActividad(a, ahora);
            const yaEntregada = entregadas.has(a.id);
            return (
              <div
                key={a.id}
                className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-4"
              >
                <span
                  aria-hidden
                  className="mb-2 block h-2.5 w-2.5 rounded-full"
                  style={{ background: TONO[estado] }}
                />
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-semibold leading-snug text-[var(--oc-text)]">
                    {ROTULO[estado]} ({a.titulo})
                  </p>
                  {a.peso !== null && (
                    <span className="shrink-0 text-base font-bold text-[var(--oc-text)]">{a.peso}%</span>
                  )}
                </div>
                {a.descripcion && (
                  <p className="mt-3 text-sm text-[var(--oc-muted)]">{a.descripcion}</p>
                )}
                {a.fecha_limite && (
                  <p className="mt-2 text-xs text-[var(--oc-muted)]">
                    Entrega: {new Date(a.fecha_limite).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {/* Vencida no ofrece entregar: el servidor lo dejaría pasar
                      (la tabla no lo impide) pero enseñar el botón invitaría a
                      entregar fuera de plazo sin avisar de que lo está. */}
                  {puedeEntregar && estado !== "vencida" && (
                    <Boton
                      primario={!yaEntregada}
                      onClick={() => {
                        void actionEntregarActividad({ actividadId: a.id }).then((r) => {
                          setMsg(r.ok ? "Entrega registrada." : r.error);
                          if (r.ok) void cargar();
                        });
                      }}
                    >
                      {yaEntregada ? "Volver a entregar" : "Subir actividad"}
                    </Boton>
                  )}
                  {puedeEntregar && yaEntregada && (
                    <span className="self-center text-xs font-semibold text-[var(--oc-ok)]">Entregada</span>
                  )}
                  {puedeEditar && (
                    <Boton
                      onClick={() => {
                        void actionEliminarActividad(a.id).then(() => cargar());
                      }}
                    >
                      Eliminar
                    </Boton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
