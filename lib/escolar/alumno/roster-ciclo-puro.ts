/**
 * roster-ciclo-puro.ts — MÓDULO PURO. Cómo se agrupa y se cuenta el padrón del
 * ciclo. 2026-10-25.
 *
 * Nace con el rol Servicio Escolar, que pide ver «los alumnos que hay por
 * grado, grupo y carrera». Esa frase esconde una regla que no es obvia: en este
 * plantel el grupo NO identifica por sí solo. «3RO A» existe en MECATRÓNICA y
 * en RH, y «5TO A» también. La clave de agrupación son los TRES campos juntos,
 * y por eso vive aquí y no dentro de la consulta: es una decisión del dominio,
 * y se puede probar sin base.
 */

/** Una fila del padrón, tal como se lee y como se baja. */
export type FilaRoster = {
  curp: string;
  pApellido: string;
  sApellido: string;
  nombre: string;
  numeroControl: string;
  grado: string;
  grupo: string;
  carrera: string;
};

/** Un grupo del ciclo con sus alumnos. */
export type GrupoDelCiclo = {
  /** `grado|grupo|carrera`, que es lo que de verdad identifica. */
  clave: string;
  grado: string;
  grupo: string;
  carrera: string;
  /** Rótulo para la pantalla: «3RO A · MECATRONICA». */
  etiqueta: string;
  alumnos: FilaRoster[];
  /** De ellos, cuántos no tienen número de control. */
  sinNumeroControl: number;
};

/** Nombre completo, en el orden en que se lee una lista escolar. */
export function nombreDeFila(f: FilaRoster): string {
  return [f.pApellido, f.sApellido, f.nombre].filter(Boolean).join(" ").trim() || f.curp;
}

/** La clave real de un grupo: los tres campos, no solo el grupo. */
export function claveDeGrupo(f: { grado: string; grupo: string; carrera: string }): string {
  return `${f.grado}|${f.grupo}|${f.carrera}`;
}

/** Rótulo humano: «3RO A · MECATRONICA», o «1RO A» si no hay carrera. */
export function etiquetaDeGrupo(f: { grado: string; grupo: string; carrera: string }): string {
  const base = [f.grado, f.grupo].filter(Boolean).join(" ").trim();
  return f.carrera ? `${base} · ${f.carrera}` : base || "Sin grupo";
}

/**
 * Agrupa el padrón por grado + grupo + carrera, cada grupo con sus alumnos
 * ordenados por apellido y los grupos entre sí por grado y luego por carrera.
 */
export function agruparRoster(filas: FilaRoster[]): GrupoDelCiclo[] {
  const porClave = new Map<string, GrupoDelCiclo>();

  for (const f of filas) {
    const clave = claveDeGrupo(f);
    let g = porClave.get(clave);
    if (!g) {
      g = {
        clave,
        grado: f.grado,
        grupo: f.grupo,
        carrera: f.carrera,
        etiqueta: etiquetaDeGrupo(f),
        alumnos: [],
        sinNumeroControl: 0,
      };
      porClave.set(clave, g);
    }
    g.alumnos.push(f);
    if (!f.numeroControl.trim()) g.sinNumeroControl += 1;
  }

  const grupos = [...porClave.values()];
  for (const g of grupos) {
    g.alumnos.sort((a, b) => nombreDeFila(a).localeCompare(nombreDeFila(b), "es"));
  }
  grupos.sort(
    (a, b) =>
      a.grado.localeCompare(b.grado, "es") ||
      a.grupo.localeCompare(b.grupo, "es") ||
      a.carrera.localeCompare(b.carrera, "es"),
  );
  return grupos;
}

/** Totales del padrón, para la cabecera de la pantalla. */
export function resumenRoster(grupos: GrupoDelCiclo[]): {
  alumnos: number;
  grupos: number;
  sinNumeroControl: number;
} {
  return {
    alumnos: grupos.reduce((n, g) => n + g.alumnos.length, 0),
    grupos: grupos.length,
    sinNumeroControl: grupos.reduce((n, g) => n + g.sinNumeroControl, 0),
  };
}
