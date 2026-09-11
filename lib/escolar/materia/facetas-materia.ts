/**
 * facetas-materia.ts — MÓDULO PURO. Selector de ámbito (grado · grupo · carrera)
 * y buscador, en memoria, sobre una lista ya cargada.
 *
 * Rediseño Océano: el diseño repite el mismo selector de ámbito en cuatro
 * pantallas distintas (Materias disponibles, Calificaciones finales, Reportes y
 * Alumnos/Tutores). Se construye una vez aquí y se consume en las cuatro.
 *
 * NO hace I/O: recibe la lista que ya devolvió la action correspondiente y la
 * filtra. Ese es el punto — el ALCANCE lo decide el servidor (R-4: un maestro
 * con asignaciones ve menos materias que uno sin ellas), y este módulo solo
 * ordena y filtra lo que el servidor ya autorizó. Facetar en cliente nunca
 * puede ampliar lo que se ve.
 *
 * `MateriaIdentidad` ya expone grado, grupo, carrera y asignatura, así que las
 * tres facetas salen de datos existentes: cero consultas nuevas.
 */
import { normalizarNombre } from "../nombres";
import type { MateriaIdentidad } from "./materia-identidad";

/** Lo mínimo que necesita este módulo. `nombreVisible` es opcional: las listas
 *  del catálogo lo traen, las crudas no. */
export type FacetableMateria = MateriaIdentidad & { nombreVisible?: string };

/** Selección del usuario. `null` = «todos», que es el estado inicial. */
export type FiltroAmbito = {
  grado: string | null;
  grupo: string | null;
  carrera: string | null;
};

export const FILTRO_AMBITO_VACIO: FiltroAmbito = {
  grado: null,
  grupo: null,
  carrera: null,
};

/** Valor con el que se representa «sin carrera» en la UI. Las materias de 1RO
 *  no tienen carrera (`carrera: null`) y deben poder filtrarse igual que el
 *  resto; sin esta etiqueta quedarían inalcanzables desde el selector. */
export const SIN_CARRERA = "SIN CARRERA";

export type Facetas = {
  grados: string[];
  grupos: string[];
  carreras: string[];
};

function ordenar(valores: Iterable<string>): string[] {
  return [...valores].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Valores disponibles para cada faceta. Se calcula sobre la lista COMPLETA, no
 * sobre la ya filtrada: si se recalculara sobre el resultado, elegir un grado
 * vaciaría el selector de grupos y el usuario no podría volver atrás.
 */
export function facetasDisponibles(items: readonly FacetableMateria[]): Facetas {
  const grados = new Set<string>();
  const grupos = new Set<string>();
  const carreras = new Set<string>();
  for (const m of items) {
    if (m.grado) grados.add(m.grado);
    if (m.grupo) grupos.add(m.grupo);
    carreras.add(m.carrera ?? SIN_CARRERA);
  }
  return {
    grados: ordenar(grados),
    grupos: ordenar(grupos),
    carreras: ordenar(carreras),
  };
}

/** ¿La materia cae dentro del ámbito seleccionado? `null` en una faceta = no filtra. */
export function coincideAmbito(m: FacetableMateria, filtro: FiltroAmbito): boolean {
  if (filtro.grado !== null && m.grado !== filtro.grado) return false;
  if (filtro.grupo !== null && m.grupo !== filtro.grupo) return false;
  if (filtro.carrera !== null && (m.carrera ?? SIN_CARRERA) !== filtro.carrera) return false;
  return true;
}

/**
 * ¿La materia coincide con el texto buscado? Busca en nombre visible,
 * asignatura e identificador técnico — los mismos tres campos que ya busca el
 * catálogo del técnico (`MateriasConfigPanel`), para no tener dos buscadores
 * que se comporten distinto.
 *
 * Comparación normalizada (sin acentos, sin mayúsculas): «mecatrónica» y
 * «MECATRONICA» son lo mismo para quien escribe.
 */
export function coincideTexto(m: FacetableMateria, texto: string): boolean {
  const q = normalizarNombre(texto);
  if (!q) return true;
  const campos = [m.nombreVisible ?? "", m.asignatura, m.idInterno];
  return campos.some((c) => normalizarNombre(c).includes(q));
}

/**
 * Filtro completo: ámbito + texto. Es lo que consume la pantalla.
 * Conserva el orden de entrada; ordenar es decisión de quien presenta.
 */
export function aplicarFiltro<T extends FacetableMateria>(
  items: readonly T[],
  filtro: FiltroAmbito,
  texto = "",
): T[] {
  return items.filter((m) => coincideAmbito(m, filtro) && coincideTexto(m, texto));
}

/**
 * Al cambiar una faceta, las demás pueden quedar apuntando a un valor que ya no
 * existe en el subconjunto. Devuelve el filtro con las facetas imposibles
 * puestas a `null`, para que la pantalla nunca muestre «0 resultados» por una
 * combinación que el usuario no eligió conscientemente.
 */
export function sanearFiltro(
  items: readonly FacetableMateria[],
  filtro: FiltroAmbito,
): FiltroAmbito {
  const disponibles = facetasDisponibles(items);
  return {
    grado: filtro.grado !== null && disponibles.grados.includes(filtro.grado) ? filtro.grado : null,
    grupo: filtro.grupo !== null && disponibles.grupos.includes(filtro.grupo) ? filtro.grupo : null,
    carrera:
      filtro.carrera !== null && disponibles.carreras.includes(filtro.carrera)
        ? filtro.carrera
        : null,
  };
}

/** ¿Hay alguna faceta activa? Para decidir si se muestra «limpiar filtros». */
export function hayFiltroActivo(filtro: FiltroAmbito, texto = ""): boolean {
  return (
    filtro.grado !== null ||
    filtro.grupo !== null ||
    filtro.carrera !== null ||
    normalizarNombre(texto).length > 0
  );
}
