"use client";

/**
 * servicio-escolar-panel.tsx — las dos pantallas del rol Servicio Escolar
 * (2026-10-25): el padrón del ciclo y los archivos que puede llevarse.
 *
 * Qué NO hay aquí, y es a propósito: ni un botón que escriba. El rol lo usa un
 * alumno haciendo su servicio social; detecta lo que falta, se lleva la hoja y
 * se la enseña en persona a quien sí puede corregirlo. El servidor lo sostiene
 * con sus capacidades (`alumno.ver_roster`, `alumno.descargar_etiquetas`), que
 * son de solo lectura: aunque esta pantalla ofreciera un guardar, no habría
 * action que lo aceptara.
 *
 * Las clases se declaran como constantes y no como componentes con nombre: C11
 * (`test-orden`) vigila que una pieza de presentación no se redeclare en `app/`.
 */
import { useEffect, useState } from "react";
import {
  actionDescargarHojaAlumnado,
  actionDescargarPlantillaRoster,
  actionPadronDelCiclo,
} from "@/app/actions/roster";
import type { GrupoDelCiclo } from "@/lib/escolar/alumno/roster-ciclo-puro";
import { nombreDeFila } from "@/lib/escolar/alumno/roster-ciclo-puro";
import type { PiezaServicioEscolar } from "@/lib/navegacion/contenido-servicio-escolar";

const CLASE_CAJA = "rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6";
const CLASE_BOTON =
  "rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
const CLASE_ETIQUETA = "mb-1 block px-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]";
const CLASE_DATO = "text-[11px] font-semibold text-[var(--oc-text)]";
const CLASE_TENUE = "text-[10px] font-semibold text-[var(--oc-muted)]";
const CLASE_ERROR = "rounded-2xl border border-red-300/70 bg-red-50 px-4 py-3 text-[11px] font-semibold text-red-800";
const CLASE_OK = "rounded-2xl border border-emerald-400/50 bg-emerald-100 px-4 py-3 text-[11px] font-semibold text-emerald-900";
const CLASE_CHIP =
  "rounded-full border border-amber-400/60 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-900";
const CLASE_FILA = "flex flex-wrap items-center gap-2 border-b border-[var(--oc-border)] py-1.5 last:border-b-0";

/** Lo que se puede bajar, con el texto que explica para qué sirve cada hoja. */
const ARCHIVOS = [
  {
    modo: "roster",
    titulo: "Roster del ciclo",
    detalle:
      "CURP, nombre, número de control, grado, grupo y carrera de cada alumno inscrito. Es la misma hoja que usa la carga del padrón.",
  },
  {
    modo: "etiquetas",
    titulo: "Etiquetas",
    detalle: "Género, edad, correo, celular, vacunación y el comentario personal de cada alumno.",
  },
  {
    modo: "medica",
    titulo: "Situación médica",
    detalle:
      "Tipo de sangre, alergias, enfermedad crónica, lentes, salud mental, necesidad psicológica, peso, talla y estatura.",
  },
] as const;

type ModoArchivo = (typeof ARCHIVOS)[number]["modo"];

/** El modo del mapa decide qué archivo se ofrece primero. */
function archivoDelModo(modo: string | null): ModoArchivo | null {
  const m = (modo ?? "").toLowerCase();
  if (m.startsWith("roster")) return "roster";
  if (m.startsWith("etiquetas")) return "etiquetas";
  if (m.startsWith("situación") || m.startsWith("situacion") || m.startsWith("médica") || m.startsWith("medica")) {
    return "medica";
  }
  return null;
}

/** Descarga un base64 como archivo, igual que el resto de entregables .xlsx. */
function bajarXlsx(base64: string, nombre: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export function ServicioEscolarPanel({
  pieza,
  modo,
}: {
  pieza: PiezaServicioEscolar;
  modo: string | null;
}) {
  if (pieza.tipo === "archivos") return <ArchivosDelAlumnado modo={modo} />;
  return <PadronDelCiclo modo={modo} />;
}

// ---------------------------------------------------------------------------
// Alumnos › Padrón del ciclo.
// ---------------------------------------------------------------------------

function PadronDelCiclo({ modo }: { modo: string | null }) {
  const [grupos, setGrupos] = useState<GrupoDelCiclo[] | null>(null);
  const [ciclo, setCiclo] = useState<string | null>(null);
  const [resumen, setResumen] = useState<{ alumnos: number; grupos: number; sinNumeroControl: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    actionPadronDelCiclo().then((r) => {
      if (!vivo) return;
      if (r.ok) {
        setGrupos(r.grupos);
        setCiclo(r.ciclo);
        setResumen(r.resumen);
      } else {
        setError(r.error);
      }
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (cargando) return <p className={CLASE_DATO}>Leyendo el padrón del ciclo…</p>;
  if (error) return <p className={CLASE_ERROR}>{error}</p>;
  if (!grupos || !resumen) return null;

  const listaCompleta = (modo ?? "").toLowerCase().startsWith("lista");

  return (
    <div className="flex flex-col gap-4">
      <div className={CLASE_CAJA}>
        <p className={CLASE_ETIQUETA}>Ciclo {ciclo ?? "operativo"}</p>
        <p className={CLASE_DATO}>
          {resumen.alumnos} alumnos inscritos en {resumen.grupos} grupos.
          {resumen.sinNumeroControl > 0 ? ` ${resumen.sinNumeroControl} sin número de control.` : ""}
        </p>
        <p className={`mt-2 px-2 ${CLASE_TENUE}`}>
          Esta pantalla es de consulta. Si algo está mal o falta, descarga el archivo en «Descargas» y
          enséñaselo a dirección: desde aquí no se corrige nada.
        </p>
      </div>

      {listaCompleta ? (
        <div className={CLASE_CAJA}>
          <p className={CLASE_ETIQUETA}>Todos los alumnos del ciclo</p>
          <ul className="flex flex-col">
            {grupos.flatMap((g) =>
              g.alumnos.map((a) => (
                <li key={a.curp} className={CLASE_FILA}>
                  <span className={CLASE_DATO}>{nombreDeFila(a)}</span>
                  <span className={CLASE_TENUE}>
                    {g.etiqueta} · {a.curp}
                  </span>
                  {a.numeroControl ? (
                    <span className={CLASE_TENUE}>N.º {a.numeroControl}</span>
                  ) : (
                    <span className={CLASE_CHIP}>sin número de control</span>
                  )}
                </li>
              )),
            )}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map((g) => (
            <div key={g.clave} className={CLASE_CAJA}>
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-2 text-left"
                onClick={() => setAbierto((a) => (a === g.clave ? null : g.clave))}
                aria-expanded={abierto === g.clave}
              >
                <span className={CLASE_DATO}>{g.etiqueta}</span>
                <span className={CLASE_TENUE}>{g.alumnos.length} alumnos</span>
                {g.sinNumeroControl > 0 ? (
                  <span className={CLASE_CHIP}>{g.sinNumeroControl} sin número de control</span>
                ) : null}
                <span className={`ml-auto ${CLASE_TENUE}`}>{abierto === g.clave ? "Ocultar" : "Ver"}</span>
              </button>
              {abierto === g.clave ? (
                <ul className="mt-3 flex flex-col">
                  {g.alumnos.map((a) => (
                    <li key={a.curp} className={CLASE_FILA}>
                      <span className={CLASE_DATO}>{nombreDeFila(a)}</span>
                      <span className={CLASE_TENUE}>{a.curp}</span>
                      {a.numeroControl ? (
                        <span className={CLASE_TENUE}>N.º {a.numeroControl}</span>
                      ) : (
                        <span className={CLASE_CHIP}>sin número de control</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Descargas › Archivos del alumnado.
// ---------------------------------------------------------------------------

function ArchivosDelAlumnado({ modo }: { modo: string | null }) {
  const [bajando, setBajando] = useState<ModoArchivo | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const destacado = archivoDelModo(modo);
  const orden = destacado
    ? [...ARCHIVOS].sort((a, b) => (a.modo === destacado ? -1 : b.modo === destacado ? 1 : 0))
    : [...ARCHIVOS];

  async function descargar(cual: ModoArchivo) {
    setBajando(cual);
    setMensaje(null);
    setError(null);
    const res =
      cual === "roster"
        ? await actionDescargarPlantillaRoster()
        : await actionDescargarHojaAlumnado(cual);
    setBajando(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    bajarXlsx(res.base64, res.nombreArchivo);
    if ("sinNumeroControl" in res) {
      setMensaje(
        `Roster descargado: ${res.alumnos} alumnos` +
          (res.sinNumeroControl > 0 ? ` · ${res.sinNumeroControl} sin número de control.` : "."),
      );
    } else {
      setMensaje(
        `Archivo descargado: ${res.alumnos} alumnos` +
          (res.sinFicha > 0 ? ` · ${res.sinFicha} sin ningún dato capturado.` : "."),
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className={CLASE_ERROR}>{error}</p> : null}
      {mensaje ? <p className={CLASE_OK}>{mensaje}</p> : null}

      {orden.map((a) => (
        <div key={a.modo} className={CLASE_CAJA}>
          <p className={CLASE_DATO}>{a.titulo}</p>
          <p className={`mt-1 ${CLASE_TENUE}`}>{a.detalle}</p>
          <div className="mt-3">
            <button
              type="button"
              className={CLASE_BOTON}
              onClick={() => void descargar(a.modo)}
              disabled={bajando !== null}
            >
              {bajando === a.modo ? "Preparando…" : "Descargar .xlsx"}
            </button>
          </div>
        </div>
      ))}

      <p className={`px-2 ${CLASE_TENUE}`}>
        Los archivos llevan datos personales de los alumnos. Descárgalos para el trabajo que tengas
        encomendado y no los dejes en un equipo compartido.
      </p>
    </div>
  );
}
