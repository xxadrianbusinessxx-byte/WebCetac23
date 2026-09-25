/**
 * constancia-puro.ts — MÓDULO PURO. Arma la constancia de estudios del CETAC 23
 * con el formato oficial del plantel (2026-09-24).
 *
 * El formato es el de la constancia que la escuela ya emite: encabezado de
 * Gobierno de México / Educación, «ASUNTO: CONSTANCIA», el párrafo del director
 * con el C.C.T., «HACE CONSTAR:», los datos del alumno, la fecha en letras y la
 * firma del director. De un alumno a otro solo cambian SUS datos; el resto es del
 * plantel y vive aquí como constante.
 *
 * Lo que se deduce en vez de pedirse:
 *   · el alumno / la alumna, INSCRITO / INSCRITA — de la CURP (posición 11: H/M);
 *   · el semestre en letras («SEXTO») — del grado del grupo («6TO»);
 *   · «TÉCNICO EN MECATRÓNICA» / «TÉCNICO EN RECURSOS HUMANOS» — de la carrera;
 *   · «del 16 de Febrero al 30 de Julio de 2026» — de las fechas del periodo;
 *   · «a uno de Junio del año dos mil veintiséis» — de la fecha de emisión.
 *
 * La FIRMA y el SELLO no se generan: la hoja se imprime y el director firma y
 * sella a mano, como hasta ahora. Una firma dibujada por el sistema no sería una
 * firma.
 */

/* ── Lo que es del plantel (igual en todas) ─────────────────────────────── */

export const PLANTEL = {
  nombre: "CENTRO DE ESTUDIOS TECNOLÓGICOS EN AGUAS CONTINENTALES No. 23",
  cct: "22DCM0001I",
  ubicacion: "EL MARQUÉS, QUERETARO",
  lugarExpedicion: "El Marqués, Querétaro",
  bachillerato: "Bachillerato Tecnológico Agropecuario y Ciencias del Mar",
  /** Las cuatro líneas del encabezado, tal cual las lleva el formato oficial. */
  encabezado: [
    "Subsecretaria de Educación Publica",
    "Dirección General de Educación Tecnológica",
    "Agropecuaria y Ciencias del Mar",
    "Centro de Estudios Tecnológica en Aguas Continentales",
  ],
  director: { nombre: "M. en E. FRANCISCO J. REGO PORTILLO", cargo: "DIRECTOR CETAC 23" },
  pie: [
    "Circuito del Lago s/n Fracc. Colinas de la Piedad, CP 76240, La Piedad, Municipio del",
    "Marqués, Qro. Correo Electrónico: qro.cetac23,direccio@dgetaycm,sems.gob.mx",
  ],
} as const;

/* ── Números y fechas en letras ─────────────────────────────────────────── */

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const HASTA_29 = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés",
  "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];

/** 0–99 en letras: «uno», «veintiséis», «treinta y uno». */
export function numeroEnLetras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new RangeError(`Fuera de rango: ${n}`);
  if (n < 30) return HASTA_29[n]!;
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d]! : `${DECENAS[d]} y ${HASTA_29[u]}`;
}

/** Años 2000–2099: «dos mil», «dos mil veintiséis». */
export function anioEnLetras(anio: number): string {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2099) throw new RangeError(`Año fuera de rango: ${anio}`);
  const resto = anio - 2000;
  return resto === 0 ? "dos mil" : `dos mil ${numeroEnLetras(resto)}`;
}

/** «uno de Junio del año dos mil veintiséis». Sin depender del idioma del equipo. */
export function fechaEnLetras(f: Date): string {
  return `${numeroEnLetras(f.getDate())} de ${MESES[f.getMonth()]} del año ${anioEnLetras(f.getFullYear())}`;
}

/** «2026-02-16» → { d: 16, m: 1, a: 2026 }. Sin `Date`: una fecha sin hora no tiene zona. */
function partesFecha(iso: string | null | undefined): { d: number; m: number; a: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const a = Number(m[1]);
  const mes = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (mes < 0 || mes > 11 || d < 1 || d > 31) return null;
  return { d, m: mes, a };
}

/**
 * «16 de Febrero al 30 de Julio de 2026». Si el semestre cruza de año, cada fecha
 * lleva el suyo: «17 de Agosto de 2026 al 15 de Enero de 2027».
 */
export function periodoSemestre(inicio: string | null | undefined, fin: string | null | undefined): string | null {
  const i = partesFecha(inicio);
  const f = partesFecha(fin);
  if (!i || !f) return null;
  const desde = i.a === f.a ? `${i.d} de ${MESES[i.m]}` : `${i.d} de ${MESES[i.m]} de ${i.a}`;
  return `${desde} al ${f.d} de ${MESES[f.m]} de ${f.a}`;
}

/* ── Lo que se deduce del alumno ────────────────────────────────────────── */

const ORDINALES = ["", "PRIMER", "SEGUNDO", "TERCER", "CUARTO", "QUINTO", "SEXTO"];

/** «6TO» → «SEXTO». Lee el primer dígito del grado del grupo; fuera de 1–6, null. */
export function semestreEnLetras(grado: string): string | null {
  const n = Number(/\d/.exec(grado)?.[0] ?? "");
  return ORDINALES[n] || null;
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** La carrera como la imprime la constancia. Las dos del plantel, con su acento. */
export function tituloCarrera(carrera: string): string | null {
  const c = sinAcentos(carrera);
  if (!c) return null;
  if (c.includes("MECATRONICA")) return "TÉCNICO EN MECATRÓNICA";
  if (c.includes("RECURSOS HUMANOS") || c === "RH") return "TÉCNICO EN RECURSOS HUMANOS";
  return `TÉCNICO EN ${carrera.trim().toUpperCase()}`;
}

/** La CURP lleva el sexo en la posición 11: H o M. Cualquier otra cosa, sin dato. */
export function sexoDesdeCurp(curp: string): "H" | "M" | null {
  const s = curp.trim().toUpperCase()[10];
  return s === "H" || s === "M" ? s : null;
}

/* ── La constancia ──────────────────────────────────────────────────────── */

export type DatosConstancia = {
  nombre: string;
  curp: string;
  numeroControl: string | null;
  /** Grado del grupo en que está inscrito («6TO»). */
  grado: string;
  carrera: string;
  /** Fechas del periodo en curso, «YYYY-MM-DD». */
  inicioSemestre: string | null;
  finSemestre: string | null;
  /** Fecha de expedición. Se recibe, no se lee del reloj: así la prueba es estable. */
  fecha: Date;
};

export type ConstanciaArmada = {
  /** «el alumno» / «la alumna». */
  tratamiento: string;
  /** «INSCRITO» / «INSCRITA». */
  inscrito: string;
  /** «al interesado» / «a la interesada». */
  interesado: string;
  nombre: string;
  numeroControl: string;
  curp: string;
  semestre: string;
  carrera: string;
  periodo: string;
  fechaEnLetras: string;
  /** Lo que falta del alumno. Con algo aquí, la constancia NO se imprime. */
  faltantes: string[];
};

export function armarConstancia(d: DatosConstancia): ConstanciaArmada {
  const faltantes: string[] = [];
  const nombre = d.nombre.trim().toUpperCase();
  const curp = d.curp.trim().toUpperCase();
  const numeroControl = (d.numeroControl ?? "").trim();
  const semestre = semestreEnLetras(d.grado);
  const carrera = tituloCarrera(d.carrera);
  const periodo = periodoSemestre(d.inicioSemestre, d.finSemestre);

  if (!nombre) faltantes.push("Nombre del alumno");
  if (!curp) faltantes.push("CURP");
  if (!numeroControl) faltantes.push("Número de control");
  if (!semestre) faltantes.push("Semestre (inscripción en un grupo del ciclo)");
  if (!carrera) faltantes.push("Carrera");
  if (!periodo) faltantes.push("Fechas del semestre (inicio y fin del ciclo)");

  // Sin sexo en la CURP se usa la forma que ya usa el formato oficial.
  const mujer = sexoDesdeCurp(curp) === "M";
  return {
    tratamiento: mujer ? "la alumna" : "el alumno",
    inscrito: mujer ? "INSCRITA" : "INSCRITO",
    interesado: mujer ? "a la interesada" : "al interesado",
    nombre,
    numeroControl,
    curp,
    semestre: semestre ?? "",
    carrera: carrera ?? "",
    periodo: periodo ?? "",
    fechaEnLetras: fechaEnLetras(d.fecha),
    faltantes,
  };
}
