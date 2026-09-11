/**
 * maquetas-oceano.tsx — las pantallas que el diseño dibuja y el sistema
 * todavía no puede operar.
 *
 * QUÉ ES ESTO Y QUÉ NO ES
 * Es VISUALIZACIÓN: reproduce el frame de Figma para que se pueda ver, navegar
 * y revisar la forma final antes de que exista el backend. No es una
 * simulación — no inventa datos, no finge que guardó, no guarda nada en
 * memoria entre pestañas. Los textos son los del diseño, marcadores incluidos
 * («Nombre de tutora», «(día) a las (hora)»), porque cambiarlos por datos
 * falsos haría creer que algo funciona.
 *
 * POR QUÉ SE ENSEÑAN ESTAS Y NO OTRAS
 * El criterio es «¿existe el frame?», no «¿tiene backend?». Citas, Reportes,
 * Recursos administrativos, Buzón y Actividades están dibujados por completo
 * en el archivo de Figma. Recursos, Chat y Sesiones programadas aparecen como
 * rótulo en el sidebar y ningún frame muestra su contenido: esos quedan
 * apagados, porque enseñarlos exigiría diseñarlos.
 *
 * CONTROLES INERTES, PERO CON LA FORMA CORRECTA
 * Los botones y campos van `disabled`: se ven como en el diseño y no
 * responden. Un control que parece operativo y no hace nada es peor que uno
 * que se declara. El aviso de la cabecera lo dice una vez, arriba, y no se
 * oculta.
 *
 * CUANDO UNA DE ESTAS ENTIDADES EXISTA, este archivo pierde esa pantalla: se
 * sustituye por la pieza real en `contenido-*.ts`. No se rellena esta maqueta
 * con datos.
 */
import type { ReactNode } from "react";

/* ── Primitivas ────────────────────────────────────────────────────────── */

function Titulo({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 text-3xl font-bold tracking-tight text-[var(--oc-text)]">{children}</h2>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-5">
      {children}
    </div>
  );
}

/** Botón del diseño, inerte. Mantiene la forma; no responde. */
function Boton({ children, primario = false }: { children: ReactNode; primario?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title="Vista previa: este control todavía no opera"
      className={`cursor-not-allowed rounded-lg px-5 py-2 text-sm font-semibold ${
        primario
          ? "bg-[var(--oc-mint)] text-[var(--oc-mint-ink)]"
          : "border border-[var(--oc-border)] bg-[var(--oc-input)] text-[var(--oc-text)]"
      }`}
    >
      {children}
    </button>
  );
}

/** Campo del diseño, inerte. */
function Campo({ placeholder, ancho = "" }: { placeholder: string; ancho?: string }) {
  return (
    <input
      type="text"
      disabled
      placeholder={placeholder}
      title="Vista previa: este control todavía no opera"
      className={`cursor-not-allowed rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-sm text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] ${ancho}`}
    />
  );
}

/** Caja grande con su rótulo centrado: el diseño la dibuja vacía. */
function Caja({ rotulo, alto = "h-56" }: { rotulo: string; alto?: string }) {
  return (
    <div
      className={`flex ${alto} items-center justify-center rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)]/40 px-4 text-center text-xs font-medium uppercase tracking-wider text-[var(--oc-muted)]`}
    >
      {rotulo}
    </div>
  );
}

/** Tarjeta de solicitud: punto rojo, titular, motivo y dos acciones.
 *  Es el patrón que el diseño repite en Citas, Constancias y Justificaciones. */
function TarjetaSolicitud({
  titular,
  motivo,
  acciones,
}: {
  titular: string;
  motivo: string;
  acciones: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)]/60 p-4">
      <span
        aria-hidden
        className="mb-2 block h-2.5 w-2.5 rounded-full"
        style={{ background: "var(--oc-alert)" }}
      />
      <p className="text-lg font-semibold text-[var(--oc-text)]">{titular}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--oc-muted)]">{motivo}</p>
        <div className="flex gap-3">{acciones}</div>
      </div>
    </div>
  );
}

/** Las tarjetas vacías que el diseño dibuja debajo de la primera. */
function TarjetasVacias({ n = 3 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className="h-28 rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)]/25"
        />
      ))}
    </>
  );
}

/** Selector de ámbito (grado · grupo · carrera), inerte. */
function SelectorAmbito() {
  return (
    <div className="flex flex-wrap gap-3">
      {["Grado", "Grupo", "Carrera"].map((f) => (
        <span
          key={f}
          className="cursor-not-allowed rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-8 py-2.5 text-sm text-[var(--oc-muted)]"
        >
          {f}
        </span>
      ))}
    </div>
  );
}

/** Ficha de detalle a la derecha: rótulo grande, valor entrecomillado. */
function Ficha({ filas }: { filas: [string, string][] }) {
  return (
    <div className="flex flex-col gap-3">
      {filas.map(([k, v]) => (
        <div key={k}>
          <p className="text-xl font-bold text-[var(--oc-text)]">{k}</p>
          <p className="text-xs font-semibold text-[var(--oc-muted)]">{v}</p>
        </div>
      ))}
    </div>
  );
}

/** Configurador de días y horas. El diseño lo repite igual en Citas y en
 *  Recursos administrativos, así que es una sola pieza. */
function ConfiguradorDeCitas() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="mb-4 text-xl font-bold text-[var(--oc-text)]">
          Configura días donde quieres recibir citas
        </h3>
        <Caja rotulo="Visualizador de calendario de ciclo" alto="h-64" />
        <div className="mt-3 flex justify-end">
          <Boton>Guardar configuracion</Boton>
        </div>
      </section>
      <section>
        <h3 className="mb-4 text-xl font-bold text-[var(--oc-text)]">
          Configura Horas libres donde quieres recibir citas (Dentro del horario del calendario)
        </h3>
        <div className="flex flex-wrap gap-4">
          {["7:00/8:00", "8:00/9:00", "8:00/9:00"].map((h, i) => (
            <span
              key={i}
              className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-10 py-5 text-sm font-bold text-[var(--oc-text)]"
            >
              {h}
            </span>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Boton>Guardar configuracion</Boton>
        </div>
      </section>
    </div>
  );
}

/* ── Las once pantallas ────────────────────────────────────────────────── */

function Citas({ modo }: { modo: string | null }) {
  if ((modo ?? "").startsWith("Configurar")) {
    return (
      <>
        <Titulo>Configuración citas</Titulo>
        <Panel>
          <ConfiguradorDeCitas />
        </Panel>
      </>
    );
  }
  if ((modo ?? "").includes("programadas")) {
    return (
      <>
        <Titulo>Citas programadas</Titulo>
        <Panel>
          <p className="mb-3 text-xl font-bold text-[var(--oc-text)]">
            Citas (Fecha) (Cupos disponibles ó Lleno)
          </p>
          <TarjetaSolicitud
            titular="Nombre de tutora tiene una cita el (día) a las (hora)"
            motivo="Descripción de cita programada"
            acciones={<Boton>Marcar como finalizada</Boton>}
          />
        </Panel>
      </>
    );
  }
  return (
    <>
      <Titulo>Citas pendientes</Titulo>
      <Panel>
        <div className="flex flex-col gap-4">
          <TarjetaSolicitud
            titular="Nombre de tutora tutora de “nombre” Solicito una cita el (día) a las (hora)"
            motivo="Motivo de cita por parte de tutor"
            acciones={
              <>
                <Boton>Aceptar</Boton>
                <Boton>Rechazar</Boton>
              </>
            }
          />
          <TarjetasVacias />
        </div>
      </Panel>
    </>
  );
}

function Reportes({ modo }: { modo: string | null }) {
  if ((modo ?? "").startsWith("Crea")) {
    return (
      <>
        <Titulo>Reportes</Titulo>
        <Panel>
          <h3 className="mb-4 text-xl font-bold text-[var(--oc-text)]">Busca al alumno</h3>
          <div className="flex flex-wrap items-start gap-8">
            <div className="flex flex-col gap-3">
              <Campo placeholder="Curp o nombre del alumno" ancho="w-80" />
              <div className="flex justify-end">
                <Boton>Buscar</Boton>
              </div>
            </div>
            <Ficha filas={[["Nombre de alumno", "Grupo Grado Carrera"]]} />
          </div>

          <div className="mt-8 flex flex-col gap-6 border-t border-[var(--oc-border)] pt-6">
            <Campo placeholder="Motivo de reporte" ancho="w-full max-w-xl py-8" />
            <section>
              <h3 className="mb-3 text-xl font-bold text-[var(--oc-text)]">Fecha del reporte</h3>
              <div className="flex flex-wrap gap-4">
                <Boton>Seleccionar fecha</Boton>
                <Boton>Seleccionar hora</Boton>
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xl font-bold text-[var(--oc-text)]">
                Selecciona gravedad del reporte
              </h3>
              <Boton>Gravedad</Boton>
            </section>
            <div className="flex justify-end">
              <Boton primario>Confirmar</Boton>
            </div>
          </div>
        </Panel>
      </>
    );
  }
  return (
    <>
      <Titulo>Reportes</Titulo>
      <Panel>
        <h3 className="mb-3 text-xl font-bold text-[var(--oc-text)]">
          Selecciona grado grupo y carrera para ver reportes divididos
        </h3>
        <SelectorAmbito />
        <h3 className="mb-3 mt-6 text-xl font-bold text-[var(--oc-text)]">Selecciona un reporte</h3>
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="flex-1">
            <Caja rotulo="No hay reportes para este grupo" alto="h-72" />
          </div>
          <div className="lg:w-72">
            <Ficha
              filas={[
                ["Nombre de alumno", "Grupo Grado Carrera"],
                ["Motivo", "“Motivo de reporte”"],
                ["Fecha", "“Fecha”"],
                ["Gravedad", "“Gravedad”"],
              ]}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Boton>Anular</Boton>
        </div>
      </Panel>
    </>
  );
}

function RecursosAdministrativos({ modo }: { modo: string | null }) {
  const m = modo ?? "";
  if (m.startsWith("Configurar")) {
    return (
      <>
        <Titulo>Recursos administrativos</Titulo>
        <Panel>
          <ConfiguradorDeCitas />
        </Panel>
      </>
    );
  }
  if (m.includes("programadas")) {
    return (
      <>
        <Titulo>Recursos administrativos</Titulo>
        <Panel>
          <h3 className="mb-3 text-xl font-bold text-[var(--oc-text)]">
            Selecciona un Cita de constancia
          </h3>
          <div className="flex flex-col gap-8 lg:flex-row">
            <div className="flex-1">
              <Caja rotulo="No hay constancias para este grupo" alto="h-72" />
            </div>
            <div className="lg:w-72">
              <Ficha
                filas={[
                  ["Nombre de alumno", "Grupo Grado Carrera"],
                  ["Motivo", "“Motivo de constancia”"],
                  ["Fecha", "“Fecha”"],
                ]}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Boton>Anular</Boton>
          </div>
        </Panel>
      </>
    );
  }
  return (
    <>
      <Titulo>Recursos administrativos</Titulo>
      <Panel>
        <div className="flex flex-col gap-4">
          <TarjetaSolicitud
            titular="Nombre de tutora tutora de “nombre” Solicito una constancia el (día) a las (hora)"
            motivo="Motivo de constancia por parte de tutor"
            acciones={
              <>
                <Boton>Aceptar</Boton>
                <Boton>Rechazar</Boton>
              </>
            }
          />
          <TarjetasVacias />
        </div>
      </Panel>
    </>
  );
}

function Buzon({ modo }: { modo: string | null }) {
  const quejas = !(modo ?? "").includes("comentarios");
  return (
    <>
      <Titulo>Buzón</Titulo>
      <Panel>
        <div className="flex flex-col gap-4">
          {[
            ["“Nombre del alumno”", "Mensaje"],
            ["“Nombre del tutor”", "Mensaje"],
          ].map(([quien, msg]) => (
            <div
              key={quien}
              className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)]/60 p-4"
            >
              <span
                aria-hidden
                className="mb-2 block h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--oc-alert)" }}
              />
              <p className="text-lg font-semibold text-[var(--oc-text)]">{quien}</p>
              <p className="mt-2 text-sm text-[var(--oc-muted)]">
                {msg}
                {quejas ? "" : " (comentario)"}
              </p>
            </div>
          ))}
          <TarjetasVacias n={2} />
        </div>
      </Panel>
    </>
  );
}

function Actividades({ modo }: { modo: string | null }) {
  if ((modo ?? "").startsWith("Detalle")) {
    return (
      <>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--oc-text)]">
            Nombre actividad (estado)
          </h2>
          <span className="text-3xl font-bold text-[var(--oc-text)]">20%</span>
        </div>
        <Panel>
          <h3 className="mb-4 text-xl font-bold text-[var(--oc-text)]">Descripción de actividad</h3>
          <Caja rotulo="Archivos a subir (recurso de actividad)" alto="h-60" />
          <div className="mt-3 flex justify-end">
            <Boton>Subir actividad</Boton>
          </div>
        </Panel>
      </>
    );
  }
  return (
    <>
      <Titulo>Alias materia</Titulo>
      <Panel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["VENCIDA (nombre de actividad/tarea)", "var(--oc-alert)"],
            ["ACTIVA (nombre de actividad/tarea)", "var(--oc-ok)"],
            ["VENCIDA (nombre de actividad/tarea)", "var(--oc-alert)"],
          ].map(([titulo, color], i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)]/60 p-4"
            >
              <span
                aria-hidden
                className="mb-2 block h-2.5 w-2.5 rounded-full"
                style={{ background: color }}
              />
              <p className="text-base font-semibold leading-snug text-[var(--oc-text)]">{titulo}</p>
              <p className="mt-3 text-sm text-[var(--oc-muted)]">Descripcion de actividad</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

/* ── Despachador ──────────────────────────────────────────────────────── */

const PANTALLAS: Record<string, (p: { modo: string | null }) => ReactNode> = {
  "administracion/citas": Citas,
  "administracion/reportes": Reportes,
  "administracion/recursos-administrativos": RecursosAdministrativos,
  "administracion/buzon": Buzon,
  "materias/actividades": Actividades,
};

/** ¿Hay maqueta dibujada para este hueco? El shell lo pregunta antes de
 *  montarla: un apartado en estado `maqueta` sin pantalla aquí es un bug. */
export function hayMaqueta(idPestana: string, idApartado: string): boolean {
  return `${idPestana}/${idApartado}` in PANTALLAS;
}

export function MaquetaOceano({
  idPestana,
  idApartado,
  modo,
}: {
  idPestana: string;
  idApartado: string;
  modo: string | null;
}) {
  const Pantalla = PANTALLAS[`${idPestana}/${idApartado}`];
  if (!Pantalla) return null;
  return <>{Pantalla({ modo })}</>;
}
