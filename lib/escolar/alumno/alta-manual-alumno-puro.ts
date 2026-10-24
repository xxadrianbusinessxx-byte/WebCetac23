/**
 * alta-manual-alumno-puro.ts — MÓDULO PURO. Las decisiones del alta manual de UN
 * alumno (Personas › Alumnos › Inscripciones, PROMPT W, 2026-10-24).
 *
 * Aquí vive todo lo que se puede probar sin base de datos: qué entrada es válida,
 * cómo se normaliza un nombre para guardarlo, cómo se rotula y ordena un grupo, y
 * cómo se traduce un choque de UNIQUE. El I/O está en `alta-manual-alumno.ts`.
 *
 * Reutiliza en vez de repetir (R6): la CURP se valida con `pareceCurp` —el mismo
 * formato que ya reconoce CURPs en las tablas— y el número de control con
 * `validarNumeroControl`, que es la misma regla que el CHECK de la base.
 */
import { pareceCurp } from "../buscar-en-filas.ts";
import { normalizarNumeroControl, validarNumeroControl } from "./numero-control-puro.ts";

/** Lo que llega del formulario, ya con la forma comprobada por el esquema. */
export type EntradaAltaManualAlumno = {
  curp: string;
  numeroControl: string;
  nombre: string;
  pApellido: string;
  sApellido: string;
  grupoId: string;
  crearTutor: boolean;
};

/** Lo que se guarda: normalizado y validado. */
export type DatosAltaManualAlumno = {
  curp: string;
  numeroControl: string;
  nombre: string;
  pApellido: string;
  /** Opcional: hay personas con un solo apellido. */
  sApellido: string | null;
  grupoId: string;
  crearTutor: boolean;
};

export type GrupoAlta = { id: string; etiqueta: string };

export type ContextoAltaManual =
  | { ok: true; periodo: { id: string; nombre: string }; grupos: GrupoAlta[] }
  | { ok: false; error: string };

export type CredencialesTutorAlta = {
  claveTutor: string;
  usuario: string;
  contraseñaInicial: string;
};

/**
 * El alumno se crea o no se crea; lo que viene DESPUÉS (inscripción, tutor) puede
 * fallar por separado, y entonces se dice qué quedó hecho y qué falta. Nada se
 * deshace borrando (decisión 5 del PROMPT W).
 */
export type ResultadoAltaManual =
  | {
      ok: true;
      alumno: { curp: string; nombreCompleto: string; grupo: string };
      inscripcion: { ok: true } | { ok: false; error: string };
      /** `null` cuando no se pidió tutor. */
      tutor: ({ ok: true } & CredencialesTutorAlta) | { ok: false; error: string } | null;
    }
  | { ok: false; error: string };

const MAX_NOMBRE = 60;
/** Letras de cualquier alfabeto (acentos, Ñ, Ü), espacio, apóstrofo, punto y guion. */
const FORMATO_NOMBRE = /^[\p{L}' .-]+$/u;

/**
 * Nombre listo para `ALUMNOS`: sin espacios sobrantes y en MAYÚSCULAS, como los
 * 472 que ya hay. A diferencia de `normalizarNombre` (nombres.ts), que sirve para
 * COMPARAR y por eso quita acentos, aquí se CONSERVAN: es lo que se guarda.
 */
export function normalizarNombreAlumno(valor: string): string {
  return valor.replace(/\s+/g, " ").trim().toUpperCase();
}

function validarNombre(
  valor: string,
  falta: string,
  etiqueta: string,
): { ok: true; valor: string } | { ok: false; error: string } {
  const v = normalizarNombreAlumno(valor);
  if (!v) return { ok: false, error: falta };
  if (v.length > MAX_NOMBRE) {
    return { ok: false, error: `${etiqueta} no puede pasar de ${MAX_NOMBRE} caracteres.` };
  }
  if (!FORMATO_NOMBRE.test(v)) {
    return { ok: false, error: `${etiqueta} solo lleva letras, espacios, guiones o apóstrofos.` };
  }
  return { ok: true, valor: v };
}

/**
 * Valida y normaliza la entrada del alta. Devuelve el PRIMER problema, en palabras
 * de quien captura, o los datos listos para guardar.
 */
export function validarAltaManualAlumno(
  e: EntradaAltaManualAlumno,
): { ok: true; datos: DatosAltaManualAlumno } | { ok: false; error: string } {
  const curp = e.curp.replace(/\s+/g, "").toUpperCase();
  if (!curp) return { ok: false, error: "Escribe la CURP del alumno." };
  if (curp.length !== 18) {
    return { ok: false, error: `La CURP lleva 18 caracteres (escribiste ${curp.length}).` };
  }
  if (!pareceCurp(curp)) {
    return { ok: false, error: "La CURP no tiene un formato válido. Revísala letra por letra." };
  }

  // El número de control es obligatorio en el alta: vacío NO es «quitarlo».
  if (!normalizarNumeroControl(e.numeroControl)) {
    return { ok: false, error: "Escribe el número de control." };
  }
  const nc = validarNumeroControl(e.numeroControl);
  if (!nc.ok) return nc;

  const nombre = validarNombre(e.nombre, "Escribe el nombre del alumno.", "El nombre");
  if (!nombre.ok) return nombre;
  const pApellido = validarNombre(e.pApellido, "Escribe el apellido paterno.", "El apellido paterno");
  if (!pApellido.ok) return pApellido;

  let sApellido: string | null = null;
  if (normalizarNombreAlumno(e.sApellido)) {
    const s = validarNombre(e.sApellido, "", "El apellido materno");
    if (!s.ok) return s;
    sApellido = s.valor;
  }

  const grupoId = e.grupoId.trim();
  if (!grupoId) return { ok: false, error: "Elige el grado y grupo." };

  return {
    ok: true,
    datos: {
      curp,
      numeroControl: nc.valor as string,
      nombre: nombre.valor,
      pApellido: pApellido.valor,
      sApellido,
      grupoId,
      crearTutor: e.crearTutor === true,
    },
  };
}

/**
 * Rótulo del selector. La carrera NO es opcional en el rótulo cuando existe: de 2º
 * a 6º la misma letra se repite entre carreras (hay dos «2DO A»).
 */
export function etiquetaGrupoAlta(g: { grado: string; grupo: string; carreraClave: string }): string {
  const base = `${g.grado} ${g.grupo}`.trim();
  return g.carreraClave ? `${base} · ${g.carreraClave}` : base;
}

/** Por grado (1RO antes que 2DO, y 10 después de 9), luego grupo, luego carrera. */
export function ordenarGruposAlta<T extends { grado: string; grupo: string; carreraClave: string }>(
  grupos: T[],
): T[] {
  const cmp = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
  return [...grupos].sort(
    (a, b) => cmp(a.grado, b.grado) || cmp(a.grupo, b.grupo) || cmp(a.carreraClave, b.carreraClave),
  );
}

/**
 * Traduce un 23505 (UNIQUE) de la inserción. Postgres nombra la restricción en el
 * mensaje: si es la del número de control lo dice; cualquier otra es la CURP.
 * Solo se llega aquí si alguien dio de alta lo mismo entre la comprobación previa
 * y la inserción.
 */
export function mensajeDuplicadoAlta(mensajePostgres: string): string {
  return /numero_control/i.test(mensajePostgres)
    ? "Ese número de control ya lo tiene otro alumno."
    : "Ya existe un alumno con esa CURP.";
}
