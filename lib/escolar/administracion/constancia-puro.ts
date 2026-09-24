/**
 * constancia-puro.ts — MÓDULO PURO. Arma la constancia de estudios con los datos
 * que el sistema YA tiene de un alumno, y dice cuáles faltan para emitirla sola.
 * BETA (2026-09-24).
 *
 * ── Por qué beta ───────────────────────────────────────────────────────────
 * Hoy se puede componer casi todo el texto: nombre, CURP, matrícula, grado,
 * grupo, carrera y ciclo salen del expediente. Lo que NO existe en ninguna tabla
 * es lo que la vuelve un documento oficial: folio consecutivo, la clave del
 * centro de trabajo (CCT), quién la expide y su firma, y el sello. Por eso la
 * vista previa enseña esos huecos marcados en vez de rellenarlos: una constancia
 * con un folio inventado es peor que una que dice que le falta el folio.
 *
 * Cuando esos datos tengan tabla, se leen aquí y `faltantes` se vacía. La
 * pantalla no cambia.
 */

export type DatosConstancia = {
  nombre: string;
  curp: string;
  matricula: string;
  grado: string;
  grupo: string;
  carrera: string;
  ciclo: string;
  /** Fecha de emisión. Se recibe, no se lee del reloj: así la prueba es estable. */
  fecha: Date;
};

/** Lo que falta para emitirla sin intervención, en el orden en que se lee. */
export const DATOS_INSTITUCIONALES_PENDIENTES = [
  "Folio consecutivo",
  "Clave del centro de trabajo (CCT)",
  "Nombre y cargo de quien la expide",
  "Firma",
  "Sello del plantel",
] as const;

export const PLANTEL = "Centro de Estudios Tecnológicos en Aguas Continentales No. 23";
export const LUGAR = "El Marqués, Querétaro";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** «24 de septiembre de 2026». En español y sin depender del idioma del equipo. */
export function fechaLarga(f: Date): string {
  return `${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}`;
}

export type ConstanciaArmada = {
  titulo: string;
  lugarYFecha: string;
  destinatario: string;
  /** El párrafo que hace constar. Sin los datos del alumno no se arma. */
  cuerpo: string | null;
  cierre: string;
  /** Datos del ALUMNO que faltan: sin ellos la constancia no se puede emitir. */
  faltantesAlumno: string[];
  /** Datos de la INSTITUCIÓN que el sistema todavía no guarda. */
  faltantesInstitucion: readonly string[];
};

export function armarConstancia(d: DatosConstancia): ConstanciaArmada {
  const limpio = (x: string) => x.trim();
  const faltantesAlumno: string[] = [];
  if (!limpio(d.nombre)) faltantesAlumno.push("Nombre del alumno");
  if (!limpio(d.curp)) faltantesAlumno.push("CURP");
  if (!limpio(d.grado) || !limpio(d.grupo)) faltantesAlumno.push("Grado y grupo (inscripción en el ciclo)");
  if (!limpio(d.carrera)) faltantesAlumno.push("Carrera");
  if (!limpio(d.ciclo)) faltantesAlumno.push("Ciclo escolar en curso");

  const matricula = limpio(d.matricula) ? `, con matrícula ${limpio(d.matricula)}` : "";
  const cuerpo = faltantesAlumno.length
    ? null
    : `La Dirección de este plantel hace constar que ${limpio(d.nombre).toUpperCase()}, ` +
      `con CURP ${limpio(d.curp).toUpperCase()}${matricula}, se encuentra inscrito(a) en el ` +
      `${limpio(d.grado)} semestre, grupo ${limpio(d.grupo)}, de la carrera de ` +
      `${limpio(d.carrera)}, durante el ciclo escolar ${limpio(d.ciclo)}.`;

  return {
    titulo: "CONSTANCIA DE ESTUDIOS",
    lugarYFecha: `${LUGAR}, a ${fechaLarga(d.fecha)}`,
    destinatario: "A QUIEN CORRESPONDA:",
    cuerpo,
    cierre:
      "Se extiende la presente a petición del interesado, para los fines que a éste convengan.",
    faltantesAlumno,
    faltantesInstitucion: DATOS_INSTITUCIONALES_PENDIENTES,
  };
}
