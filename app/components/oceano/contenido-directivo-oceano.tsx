"use client";

/**
 * contenido-directivo-oceano.tsx — monta las piezas de las dos pestañas que
 * son EXCLUSIVAS del directivo: Grupos/Boleta y Administración escolar.
 *
 * Las otras dos —Materias y Calendario/Asistencias— las sirve
 * `contenido-docente-oceano.tsx`, porque en el mapa son el MISMO objeto de
 * pestaña que las del maestro. Aquí no se duplican (R6).
 *
 * De Administración escolar, solo `alumnos-tutores` tiene pieza real. Citas,
 * Reportes, Recursos administrativos y Buzón son MAQUETA: el shell las monta
 * desde `maquetas-oceano.tsx` sin pasar por aquí.
 */
import { useCallback, useEffect, useState } from "react";
import { actionObtenerVistaRegistro } from "@/app/actions/escolar";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import {
  claveDeGrupo,
  etiquetaGrupo,
  facetasDisponibles,
  FILTRO_AMBITO_VACIO,
  grupoCoincideAmbito,
  gruposDelCatalogo,
  type FiltroAmbito,
} from "@/lib/escolar/materia/facetas-materia";
import type { MateriaConNombreVisible } from "@/lib/escolar/materia/nombres-visibles";
import type { PiezaDirectivo } from "@/lib/navegacion/contenido-directivo";
import type { MateriaTablaVista } from "@/lib/escolar/types";

export type DatosDirectivoOceano = {
  /** Mismo catálogo que el docente: de aquí salen grado, grupo y carrera. */
  materias: readonly MateriaConNombreVisible[];
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]">
      {children}
    </p>
  );
}

/** Selector de ámbito. Reutiliza `facetas-materia`: las tres listas salen del
 *  catálogo que el servidor ya devolvió, no de una consulta nueva. */
function SelectorAmbito({
  materias,
  filtro,
  onFiltro,
}: {
  materias: readonly MateriaConNombreVisible[];
  filtro: FiltroAmbito;
  onFiltro: (f: FiltroAmbito) => void;
}) {
  const facetas = facetasDisponibles(materias);
  const campos: [keyof FiltroAmbito, string, string[]][] = [
    ["grado", "Grado", facetas.grados],
    ["grupo", "Grupo", facetas.grupos],
    ["carrera", "Carrera", facetas.carreras],
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      {campos.map(([clave, rotulo, valores]) => (
        <select
          key={clave}
          value={filtro[clave] ?? ""}
          onChange={(e) => onFiltro({ ...filtro, [clave]: e.target.value || null })}
          className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
        >
          <option value="">{rotulo}</option>
          {valores.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}

export function ContenidoDirectivoOceano({
  pieza,
  datos,
}: {
  pieza: PiezaDirectivo;
  datos: DatosDirectivoOceano;
}) {
  const [filtro, setFiltro] = useState<FiltroAmbito>(FILTRO_AMBITO_VACIO);
  const [registro, setRegistro] = useState("");
  /** Lo que el usuario eligió («1RO A · MECATRONICA»), no el nombre técnico de
   *  la tabla. El rótulo tiene que hablar del grupo, que es lo que se pidió. */
  const [rotulo, setRotulo] = useState("");
  const [vista, setVista] = useState<MateriaTablaVista | null>(null);
  const [cargando, setCargando] = useState(false);

  const abrir = useCallback(async (nombre: string, comoSeLlama = "") => {
    setRegistro(nombre);
    setRotulo(comoSeLlama);
    if (!nombre) return setVista(null);
    setCargando(true);
    // Fase 4.1 cerró el alcance de esta action: alumno y tutor quedan negados,
    // maestro y directivo la reciben igual que antes. Ya se puede poner en
    // pantalla sin arrastrar la fuga.
    const v = await actionObtenerVistaRegistro(nombre);
    setVista(v);
    setCargando(false);
  }, []);

  useEffect(() => {
    setRegistro("");
    setRotulo("");
    setVista(null);
  }, [pieza]);

  if (pieza === "alumnos-tutores") {
    // El buscador de alumnos con su tutor todavía no tiene una pieza propia:
    // `actionListarAlumnosGruposProfesor` da los grupos con sus alumnos, pero
    // la relación alumno→tutor la sirve `tutores.ts` por otra vía. Unirlas es
    // trabajo de dominio, no de interfaz, así que NO se improvisa aquí.
    return (
      <Aviso>
        Selección de alumno y su tutor. Falta unir las dos lecturas que ya
        existen —grupos con alumnos y la relación tutor→alumno— en una sola
        consulta; es trabajo de dominio y se hace en su propio cambio.
      </Aviso>
    );
  }

  // Grupos/Boleta filtra por GRUPO, no por materia: aquí se sube la boleta de
  // «1RO A MECATRONICA», no la de una asignatura suelta. Esa es toda la
  // diferencia con la pestaña Materias, y es el motivo de que esta pantalla
  // exista aparte.
  const grupos = gruposDelCatalogo(datos.materias).filter((g) =>
    grupoCoincideAmbito(g, filtro),
  );

  return (
    <div className="flex flex-col gap-4">
      <SelectorAmbito materias={datos.materias} filtro={filtro} onFiltro={setFiltro} />

      {!registro ? (
        <>
          {grupos.length === 0 ? (
            <Aviso>No hay grupos para ese ámbito.</Aviso>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grupos.map((g) => (
                <button
                  key={g.clave}
                  type="button"
                  // El registro de un grupo es el de su primera materia: es la
                  // tabla física donde vive la hoja de ese grupo. Mientras la
                  // boleta consolidada no tenga su propia tabla, esto es lo que
                  // hay, y se dice en el rótulo en vez de fingir otra cosa.
                  onClick={() => {
                    const primera = datos.materias.find(
                      (m) => claveDeGrupo(m) === g.clave,
                    );
                    if (primera) void abrir(primera.idInterno, etiquetaGrupo(g));
                  }}
                  className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-4 text-left transition hover:brightness-110"
                >
                  <p className="text-base font-bold text-[var(--oc-text)]">{etiquetaGrupo(g)}</p>
                  <p className="mt-1 text-xs text-[var(--oc-muted)]">
                    {g.materias} {g.materias === 1 ? "materia" : "materias"} · sube su boleta
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
          <button
            type="button"
            onClick={() => void abrir("")}
            className="w-fit rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
          >
            ← Volver a los grupos
          </button>
          {cargando ? (
            <Aviso>Cargando el registro…</Aviso>
          ) : (
            <>
              {/* El registro que se abre es el de una materia del grupo: es la
                  tabla física que hoy existe. Se dice, en vez de dejar creer
                  que ya hay una boleta consolidada por grupo. */}
              <Aviso>
                Grupo {rotulo}. Se está leyendo el registro «{registro}»; la
                boleta consolidada del grupo todavía no tiene tabla propia.
              </Aviso>
              <MateriaTablaVistaPanel
                vista={vista}
                materiaNombre={rotulo || registro}
                mostrarDetalleColumnas
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
