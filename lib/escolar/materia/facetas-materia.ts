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
import { normalizarNombre } from "../nombres.ts";
import type { MateriaIdentidad } from "./materia-identidad.ts";

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
 *  resto; sin esta etiqueta quedarían inalcanzables desde el selector.
 *
 *  DIFERENCIA DELIBERADA con `materia-selector.tsx`: allí el filtro compara
 *  contra `m.carrera ?? ""`, y como `""` es falsy la condición nunca dispara —
 *  es decir, hoy NO se puede filtrar «solo las que no tienen carrera». Esta
 *  constante lo arregla. Es una mejora, no un cambio de criterio. */
export const SIN_CARRERA = "SIN CARRERA";

/**
 * C4.28 — «General» no se muestra nunca: solo materias con grado resuelto
 * desde el catálogo (grupo_materias → grupos). Una materia sin grado es una
 * fila cuyo origen no se pudo resolver, y ofrecerla al usuario es ofrecerle
 * algo que no puede abrir.
 *
 * La regla ya vivía dentro de `materia-selector.tsx`; vive aquí para que las
 * pantallas que reutilicen este módulo no la pierdan por el camino.
 * Se puede desactivar explícitamente, pero por defecto está puesta: quien la
 * quite tiene que escribirlo.
 */
export const EXCLUIR_SIN_GRADO_POR_DEFECTO = true;

/** Código corto de carrera para la presentación en filtros (MECATRONICA → MC).
 *  Mismo criterio que `materia-selector.tsx`, para que el usuario pueda buscar
 *  «1RO A MC» y encuentre lo mismo en las dos pantallas. */
export function etiquetaCarrera(clave: string | null): string {
  const c = (clave ?? "").trim().toUpperCase();
  if (c === "MECATRONICA") return "MC";
  return c;
}

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
export function facetasDisponibles(
  items: readonly FacetableMateria[],
  excluirSinGrado = EXCLUIR_SIN_GRADO_POR_DEFECTO,
): Facetas {
  const grados = new Set<string>();
  const grupos = new Set<string>();
  const carreras = new Set<string>();
  for (const m of items) {
    if (excluirSinGrado && !m.grado) continue;
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
  // La cuarta cadena es la IDENTIDAD: permite escribir «1RO A MC» y encontrar
  // la materia sin saberse su nombre. Es lo que ya hace materia-selector.tsx;
  // omitirla aquí habría hecho que el buscador nuevo encontrara menos que el
  // viejo, que es la peor forma de migrar una pantalla.
  const identidad = `${m.grado} ${m.grupo} ${etiquetaCarrera(m.carrera)} ${m.carrera ?? ""}`;
  const campos = [m.nombreVisible ?? "", m.asignatura, m.idInterno, identidad];
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
  excluirSinGrado = EXCLUIR_SIN_GRADO_POR_DEFECTO,
): T[] {
  return items.filter(
    (m) =>
      (!excluirSinGrado || Boolean(m.grado)) &&
      coincideAmbito(m, filtro) &&
      coincideTexto(m, texto),
  );
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

/**
 * Un GRUPO del catálogo: la combinación grado · grupo · carrera. No es una
 * entidad aparte — sale de la identidad de las materias, porque una materia
 * pertenece a un grupo y el catálogo ya trae esa identidad.
 *
 * Existe para la pantalla de Grupos/Boleta, que filtra por grupo y NO por
 * materia: allí se sube la boleta de «1RO A MECATRONICA», no la de una
 * asignatura suelta.
 */
export type GrupoDelCatalogo = {
  /** Clave estable para React y para la selección: `grado|grupo|carrera`. */
  clave: string;
  grado: string;
  grupo: string;
  carrera: string | null;
  /** Cuántas materias cuelgan de él. Da idea de si el grupo está poblado. */
  materias: number;
};

/** Clave del grupo al que pertenece una materia. Vive aquí para que el formato
 *  de `clave` tenga UN solo sitio: quien quiera volver de un grupo a sus
 *  materias compara con esta función, no reescribiendo la plantilla. */
export function claveDeGrupo(m: FacetableMateria): string {
  return `${m.grado}|${m.grupo}|${m.carrera ?? ""}`;
}

/**
 * Grupos únicos del catálogo, ordenados por grado, grupo y carrera.
 *
 * Aplica la misma regla C4.28 que el resto del módulo: una materia sin grado
 * no resuelve a ningún grupo, así que no genera uno.
 */
export function gruposDelCatalogo(
  items: readonly FacetableMateria[],
  excluirSinGrado = EXCLUIR_SIN_GRADO_POR_DEFECTO,
): GrupoDelCatalogo[] {
  const mapa = new Map<string, GrupoDelCatalogo>();
  for (const m of items) {
    if (excluirSinGrado && !m.grado) continue;
    const clave = claveDeGrupo(m);
    const previo = mapa.get(clave);
    if (previo) previo.materias += 1;
    else
      mapa.set(clave, {
        clave,
        grado: m.grado,
        grupo: m.grupo,
        carrera: m.carrera,
        materias: 1,
      });
  }
  return [...mapa.values()].sort(
    (a, b) =>
      a.grado.localeCompare(b.grado, "es") ||
      a.grupo.localeCompare(b.grupo, "es") ||
      (a.carrera ?? "").localeCompare(b.carrera ?? "", "es"),
  );
}

/** Rótulo del grupo tal como se lee en pantalla: «1RO A · MECATRONICA». */
export function etiquetaGrupo(g: GrupoDelCatalogo): string {
  const base = `${g.grado} ${g.grupo}`.trim();
  return g.carrera ? `${base} · ${g.carrera}` : base;
}

/** ¿Este grupo cae dentro del ámbito seleccionado? */
export function grupoCoincideAmbito(g: GrupoDelCatalogo, filtro: FiltroAmbito): boolean {
  if (filtro.grado !== null && g.grado !== filtro.grado) return false;
  if (filtro.grupo !== null && g.grupo !== filtro.grupo) return false;
  if (filtro.carrera !== null && (g.carrera ?? SIN_CARRERA) !== filtro.carrera) return false;
  return true;
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
