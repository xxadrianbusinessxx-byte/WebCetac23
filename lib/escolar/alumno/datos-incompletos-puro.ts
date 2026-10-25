/**
 * datos-incompletos-puro.ts — MÓDULO PURO. Qué información primordial le falta
 * a un alumno. 2026-10-25.
 *
 * Qué es «primordial»: los tres datos sin los cuales el plantel no puede
 * emitirle nada ni identificarlo en un trámite — CURP, nombre completo y número
 * de control. No es una lista de deseos: el número de control va impreso en la
 * constancia de estudios, y hasta que no está, la constancia no se emite.
 *
 * Medición del día que se escribió, sobre el roster ACTIVO del ciclo operativo
 * —que es lo que mira este aviso—: 357 alumnos, 0 sin nombre, 0 con CURP mal
 * formada y **356 sin número de control**. (En `ALUMNOS` entero, que incluye a
 * quien ya no cursa, son 472 y 471.) Por eso el aviso que se pinta con esto es
 * un RESUMEN con la lista debajo, y no un mensaje por alumno: repetir 356 veces
 * la misma frase no es una notificación, es ruido.
 */

/** Los tres datos sin los que un alumno no se puede tramitar. */
export type CampoPrimordial = "curp" | "nombre" | "numero_control";

export const CAMPOS_PRIMORDIALES: readonly CampoPrimordial[] = ["curp", "nombre", "numero_control"];

export const ROTULO_CAMPO: Readonly<Record<CampoPrimordial, string>> = {
  curp: "CURP",
  nombre: "Nombre completo",
  numero_control: "Número de control",
};

/** Lo que hace falta de cada alumno para decidir. Nada de aquí viene de la red. */
export type FilaAlumnoPrimordial = {
  curp: string | null;
  nombre: string | null;
  pApellido: string | null;
  sApellido: string | null;
  numeroControl: string | null;
};

/** Mismo formato de CURP que valida el alta manual: 18 caracteres. */
export const FORMATO_CURP_ALUMNO = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$/;

function vacio(v: string | null | undefined): boolean {
  return !v || v.trim() === "";
}

/**
 * Qué le falta a este alumno, en el orden en que importa.
 *
 * El apellido materno NO cuenta: el alta manual (PROMPT W) lo acepta vacío a
 * propósito, porque hay alumnos que no lo tienen. Exigirlo aquí marcaría como
 * incompleto a quien está completo.
 */
export function faltantesDeAlumno(fila: FilaAlumnoPrimordial): CampoPrimordial[] {
  const faltan: CampoPrimordial[] = [];
  const curp = (fila.curp ?? "").trim().toUpperCase();
  if (!curp || !FORMATO_CURP_ALUMNO.test(curp)) faltan.push("curp");
  if (vacio(fila.nombre) || vacio(fila.pApellido)) faltan.push("nombre");
  if (vacio(fila.numeroControl)) faltan.push("numero_control");
  return faltan;
}

/** Un alumno del aviso: quién es, dónde está y qué le falta. */
export type AlumnoIncompleto = {
  curp: string;
  nombre: string;
  grupo: string | null;
  faltantes: CampoPrimordial[];
};

export type ResumenDatosIncompletos = {
  /** Alumnos revisados (el roster activo del ciclo operativo). */
  revisados: number;
  /** Alumnos a los que les falta al menos un dato. */
  incompletos: number;
  /** Cuántos alumnos carecen de cada dato. Un alumno puede contar en varios. */
  porCampo: Record<CampoPrimordial, number>;
};

/** Cuenta por campo. Se calcula sobre la lista ya resuelta, sin volver a la base. */
export function resumenDatosIncompletos(
  revisados: number,
  incompletos: AlumnoIncompleto[],
): ResumenDatosIncompletos {
  const porCampo: Record<CampoPrimordial, number> = { curp: 0, nombre: 0, numero_control: 0 };
  for (const a of incompletos) {
    for (const c of a.faltantes) porCampo[c] += 1;
  }
  return { revisados, incompletos: incompletos.length, porCampo };
}

/**
 * El aviso, en una frase. Es lo que se lee de un vistazo en Notificaciones;
 * el detalle está en la lista. Devuelve `null` cuando no falta nada: una
 * notificación vacía no se pinta.
 */
export function mensajeDatosIncompletos(r: ResumenDatosIncompletos): string | null {
  if (r.incompletos === 0) return null;
  const partes = CAMPOS_PRIMORDIALES.filter((c) => r.porCampo[c] > 0).map(
    (c) => `${r.porCampo[c]} sin ${ROTULO_CAMPO[c].toLowerCase()}`,
  );
  return `${r.incompletos} de ${r.revisados} alumnos del ciclo tienen información primordial incompleta: ${partes.join(" · ")}.`;
}

/** Filtra la lista por un campo. `null` = todos los incompletos. */
export function filtrarPorCampo(
  lista: AlumnoIncompleto[],
  campo: CampoPrimordial | null,
): AlumnoIncompleto[] {
  if (!campo) return lista;
  return lista.filter((a) => a.faltantes.includes(campo));
}
