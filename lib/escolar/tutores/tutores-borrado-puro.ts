/**
 * tutores-borrado-puro.ts — MÓDULO PURO. Las decisiones de editar, quitar y
 * vaciar el roster de tutores, sin base de datos. 2026-10-25.
 *
 * Por qué existe. El técnico ya administraba el roster de ALUMNOS entero
 * (cargarlo, dar de baja a uno, borrar el paso completo); el de TUTORES solo
 * lo podía crecer. Lo que faltaba no era una pantalla: era decidir, con
 * reglas que se puedan probar sin red, qué avisa cada borrado antes de
 * hacerlo y qué entra como dato válido de un tutor.
 *
 * Semántica, la misma que la baja de alumno (`roster-borrado.ts`): quitar NO
 * borra filas. `tutor_alumnos.activo = false` y, si el tutor se queda sin
 * ningún alumno, `tutores.activo = false`. El registro se conserva para
 * auditoría y la operación se deshace volviendo a vincular.
 */

/** Datos editables de un tutor. Vacío = «no lo cambies» no existe: lo que llega, se guarda. */
export type DatosTutorEditables = {
  nombre: string;
  apellidos: string;
  curp: string;
  telefono: string;
  correo: string;
};

/** Lo que se guarda: `null` donde el campo quedó vacío (la columna es nullable). */
export type DatosTutorNormalizados = {
  nombre: string | null;
  apellidos: string | null;
  curp: string | null;
  telefono: string | null;
  correo: string | null;
};

/** Mismo formato que valida el alta de alumno: 18 caracteres del Registro Nacional. */
export const FORMATO_CURP = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$/;

/** Dígitos del teléfono, sin separadores: se dictan con espacios y guiones. */
const SOLO_DIGITOS = /[^0-9+]/g;

function limpiar(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

/**
 * Normaliza lo tecleado: espacios colapsados, CURP y nombre en mayúsculas (como
 * el resto del padrón), correo en minúsculas y teléfono sin separadores.
 * Un campo vacío queda en `null`, que es como la columna representa «no se sabe».
 */
export function normalizarDatosTutor(datos: DatosTutorEditables): DatosTutorNormalizados {
  const telefono = limpiar(datos.telefono).replace(SOLO_DIGITOS, "");
  return {
    nombre: limpiar(datos.nombre).toUpperCase() || null,
    apellidos: limpiar(datos.apellidos).toUpperCase() || null,
    curp: limpiar(datos.curp).toUpperCase().replace(/\s/g, "") || null,
    telefono: telefono || null,
    correo: limpiar(datos.correo).toLowerCase() || null,
  };
}

/**
 * Entrada válida para guardar. Los cinco campos son OPCIONALES —hoy los 460
 * tutores activos están vacíos y se irán completando a mano, no de golpe—, pero
 * lo que se escriba tiene que tener forma: una CURP de 17 caracteres o un
 * teléfono de 3 dígitos es un error de captura, no un dato parcial.
 */
export function validarDatosTutor(
  datos: DatosTutorEditables,
): { ok: true; datos: DatosTutorNormalizados } | { ok: false; error: string } {
  const n = normalizarDatosTutor(datos);

  if (n.curp && !FORMATO_CURP.test(n.curp)) {
    return { ok: false, error: "La CURP del tutor no tiene el formato de 18 caracteres." };
  }
  if (n.telefono && (n.telefono.replace(/\D/g, "").length < 10 || n.telefono.length > 15)) {
    return { ok: false, error: "El teléfono debe tener al menos 10 dígitos." };
  }
  if (n.correo && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(n.correo)) {
    return { ok: false, error: "El correo no tiene una forma válida." };
  }
  if (n.nombre && n.nombre.length > 120) {
    return { ok: false, error: "El nombre no puede pasar de 120 caracteres." };
  }
  if (n.apellidos && n.apellidos.length > 120) {
    return { ok: false, error: "Los apellidos no pueden pasar de 120 caracteres." };
  }
  return { ok: true, datos: n };
}

/** Lo que hay que saber ANTES de quitarle el tutor a un alumno. */
export type ContextoQuitarTutor = {
  /** ¿El alumno tiene hoy un tutor activo? */
  tieneTutor: boolean;
  /** Alumnos ACTIVOS de ese tutor, incluido este. */
  alumnosDelTutor: number;
  /** ¿El tutor ya entró alguna vez (cambió su contraseña inicial)? */
  tutorYaEntro: boolean;
};

/**
 * Avisos de la previsualización, en orden de importancia. Lista vacía = quitar
 * no arrastra nada que no sea obvio. Nunca BLOQUEA: quitar un vínculo es
 * reversible, a diferencia de borrar el paso de un ciclo.
 */
export function avisosQuitarTutor(ctx: ContextoQuitarTutor): string[] {
  if (!ctx.tieneTutor) return [];
  const avisos: string[] = [];

  if (ctx.alumnosDelTutor > 1) {
    const otros = ctx.alumnosDelTutor - 1;
    avisos.push(
      `Este tutor tiene ${ctx.alumnosDelTutor} alumnos a su cargo: al quitárselo a este, los otros ${otros} lo conservan y la cuenta sigue activa.`,
    );
  } else {
    avisos.push("Es su único alumno: la cuenta del tutor quedará desactivada.");
  }
  if (ctx.tutorYaEntro) {
    avisos.push("El tutor ya cambió su contraseña inicial: ha usado la cuenta.");
  }
  return avisos;
}

/** ¿La cuenta del tutor se queda sin alumnos al quitarle este? */
export function tutorQuedaHuerfano(ctx: ContextoQuitarTutor): boolean {
  return ctx.tieneTutor && ctx.alumnosDelTutor <= 1;
}

/** Lo que vacía el roster de tutores completo. */
export type ContextoRosterTutores = {
  tutoresActivos: number;
  relacionesActivas: number;
  alumnosConTutor: number;
};

/**
 * ¿Se puede vaciar el roster de tutores? Solo bloquea lo que no tiene sentido:
 * un roster ya vacío. Es la operación más destructiva del panel, así que la
 * guarda real es la confirmación escrita (`confirmacionRosterCorrecta`), no una
 * regla de dominio: no hay un estado del sistema que la haga incorrecta.
 */
export function bloqueosBorrarRosterTutores(ctx: ContextoRosterTutores): string[] {
  if (ctx.tutoresActivos <= 0 && ctx.relacionesActivas <= 0) {
    return ["No hay ningún tutor activo: el roster ya está vacío."];
  }
  return [];
}

/**
 * Palabra que hay que escribir para confirmar el vaciado. Lleva el número de
 * tutores dentro a propósito: obliga a leer la previsualización, y si la cifra
 * cambió entre que se miró y se confirmó, la confirmación deja de valer.
 */
export function confirmacionRosterEsperada(ctx: ContextoRosterTutores): string {
  return `BORRAR ${ctx.tutoresActivos}`;
}

/** Comparación de la confirmación escrita, tolerante a espacios y minúsculas. */
export function confirmacionRosterCorrecta(ctx: ContextoRosterTutores, escrito: string): boolean {
  return limpiar(escrito).toUpperCase() === confirmacionRosterEsperada(ctx);
}
