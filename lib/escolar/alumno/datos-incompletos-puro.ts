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
 *
 * PROMPT AB (2026-10-29): también los alumnos marcados como «Pendiente de
 * administración» (etiqueta dinámica en `alumno_etiquetas`), aunque no tengan
 * inscripción en el ciclo operativo. A esos les falta el GRUPO, que es un cuarto
 * dato primordial: sin él no hay horario, lista ni constancia. El grupo lo
 * inscribe el Técnico; la etiqueta la quita Administración cuando todo cierra.
 */

/** Los datos sin los que un alumno no se puede tramitar. */
export type CampoPrimordial = "curp" | "nombre" | "grupo" | "numero_control";

export const CAMPOS_PRIMORDIALES: readonly CampoPrimordial[] = ["curp", "nombre", "grupo", "numero_control"];

export const ROTULO_CAMPO: Readonly<Record<CampoPrimordial, string>> = {
  curp: "CURP",
  nombre: "Nombre completo",
  grupo: "Grupo, grado y carrera",
  numero_control: "Número de control",
};

/**
 * Título de la etiqueta dinámica que marca a un alumno como pendiente de
 * administración. Es la ÚNICA copia del literal: la lectura y la UI la importan.
 */
export const TITULO_ETIQUETA_PENDIENTE = "Pendiente de administración";

/** ¿Este título es la marca? Sin distinguir mayúsculas ni espacios de más. */
export function esEtiquetaPendiente(titulo: string | null | undefined): boolean {
  const normal = (t: string) => t.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
  return normal(titulo ?? "") === normal(TITULO_ETIQUETA_PENDIENTE);
}

/** Una fila de `alumno_etiquetas` tal como hace falta para decidir. */
export type EtiquetaDeAlumno = { curp: string | null; titulo: string | null; valor: string | null };

/**
 * CURP marcadas → su nota (el `valor` de la etiqueta). Si un alumno tiene la
 * marca dos veces, las notas se juntan; una marca sin valor deja nota vacía,
 * pero el alumno sigue marcado.
 */
export function notasDePendientes(etiquetas: readonly EtiquetaDeAlumno[]): Map<string, string> {
  const notas = new Map<string, string>();
  for (const e of etiquetas) {
    if (!esEtiquetaPendiente(e.titulo)) continue;
    const curp = (e.curp ?? "").trim().toUpperCase();
    if (!curp) continue;
    const valor = (e.valor ?? "").trim();
    const previa = notas.get(curp);
    notas.set(curp, previa === undefined ? valor : [previa, valor].filter(Boolean).join(" · "));
  }
  return notas;
}

/**
 * Las CURP que se revisan: el roster activo del ciclo operativo y, además, las
 * marcadas que no están en él. Cada CURP una sola vez, el roster primero.
 */
export function curpsARevisar(
  roster: readonly string[],
  marcadas: Iterable<string>,
): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const c of [...roster, ...marcadas]) {
    const curp = c.trim().toUpperCase();
    if (!curp || vistas.has(curp)) continue;
    vistas.add(curp);
    salida.push(curp);
  }
  return salida;
}

/** Lo que hace falta de cada alumno para decidir. Nada de aquí viene de la red. */
export type FilaAlumnoPrimordial = {
  curp: string | null;
  nombre: string | null;
  pApellido: string | null;
  sApellido: string | null;
  numeroControl: string | null;
  /**
   * ¿Tiene inscripción activa en el ciclo operativo? Ausente cuenta como sí:
   * el roster, que es de donde sale casi todo, por definición la tiene.
   */
  tieneGrupo?: boolean;
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
  if (fila.tieneGrupo === false) faltan.push("grupo");
  if (vacio(fila.numeroControl)) faltan.push("numero_control");
  return faltan;
}

/** Un alumno del aviso: quién es, dónde está y qué le falta. */
export type AlumnoIncompleto = {
  curp: string;
  nombre: string;
  grupo: string | null;
  faltantes: CampoPrimordial[];
  /** Valor de la marca «Pendiente de administración»; `null` si no la tiene. */
  nota: string | null;
};

/**
 * ¿Sale en la lista? Si le falta algo, o si está marcado: la marca se respeta
 * hasta que Administración la quita, aunque los datos ya estén completos
 * (p. ej. tiene grupo, pero hay que confirmar que es el correcto).
 */
export function debeListarse(faltantes: readonly CampoPrimordial[], nota: string | null): boolean {
  return faltantes.length > 0 || nota !== null;
}

export type ResumenDatosIncompletos = {
  /** Alumnos revisados (el roster activo del ciclo operativo). */
  revisados: number;
  /** Alumnos a los que les falta al menos un dato. */
  incompletos: number;
  /** Marcados que ya tienen todo: solo falta confirmar y quitar la marca. */
  porConfirmar: number;
  /** Cuántos alumnos carecen de cada dato. Un alumno puede contar en varios. */
  porCampo: Record<CampoPrimordial, number>;
};

/** Cuenta por campo. Se calcula sobre la lista ya resuelta, sin volver a la base. */
export function resumenDatosIncompletos(
  revisados: number,
  incompletos: AlumnoIncompleto[],
): ResumenDatosIncompletos {
  const porCampo: Record<CampoPrimordial, number> = { curp: 0, nombre: 0, grupo: 0, numero_control: 0 };
  let conFaltantes = 0;
  for (const a of incompletos) {
    if (a.faltantes.length > 0) conFaltantes += 1;
    for (const c of a.faltantes) porCampo[c] += 1;
  }
  return { revisados, incompletos: conFaltantes, porConfirmar: incompletos.length - conFaltantes, porCampo };
}

/**
 * El aviso, en una frase. Es lo que se lee de un vistazo en Notificaciones;
 * el detalle está en la lista. Devuelve `null` cuando no falta nada: una
 * notificación vacía no se pinta.
 */
export function mensajeDatosIncompletos(r: ResumenDatosIncompletos): string | null {
  const confirmar =
    r.porConfirmar === 0
      ? ""
      : `${r.porConfirmar} ${r.porConfirmar === 1 ? "alumno marcado" : "alumnos marcados"} por confirmar.`;
  if (r.incompletos === 0) return confirmar || null;
  const partes = CAMPOS_PRIMORDIALES.filter((c) => r.porCampo[c] > 0).map(
    (c) => `${r.porCampo[c]} sin ${ROTULO_CAMPO[c].toLowerCase()}`,
  );
  const frase = `${r.incompletos} de ${r.revisados} alumnos del ciclo tienen información primordial incompleta: ${partes.join(" · ")}.`;
  return confirmar ? `${frase} ${confirmar}` : frase;
}

/** Filtra la lista por un campo. `null` = todos los incompletos. */
export function filtrarPorCampo(
  lista: AlumnoIncompleto[],
  campo: CampoPrimordial | null,
): AlumnoIncompleto[] {
  if (!campo) return lista;
  return lista.filter((a) => a.faltantes.includes(campo));
}
