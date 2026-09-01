import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traerAlumnosExistentes, nombreCompletoAlumno } from "./alumnos";
import type { AlumnoRow } from "./types";
import { matrizACsvTexto } from "./csv";
import {
  TABLA_ALUMNOS,
  TABLA_TUTORES,
  TABLA_TUTOR_ALUMNOS,
  TABLA_TUTOR_CREDENCIALES_INICIALES,
} from "./tables";

import {

  nombreCompletoTutor,
  type TutorAlumnoRow,
  type TutorRow,
} from "./tutores-types";


// Re-export de tipos y funciones puras para que los módulos de servidor
// (Server Actions, portal-login) sigan importando desde aquí sin cambios.
export { nombreCompletoTutor, type TutorAlumnoRow, type TutorRow };


/**
 * Dominio de TUTORES/PADRES (Bloque 6A).
 *
 * El tutor es una entidad independiente del alumno. Su identidad de relación
 * es `tutor_id` (UUID) y su clave pública/amigable es `clave_tutor`
 * (formato `TUT-XXXXXXXX`). La relación con alumnos vive en `tutor_alumnos`.
 *
 * Reglas de negocio:
 *  - La contraseña se guarda SIEMPRE como hash scrypt (nunca en texto plano).
 *  - La contraseña inicial se deriva de los últimos 8 caracteres del CURP del
 *    alumno de referencia (regla distinta a `claveDesdeCurp` de alumnos, que
 *    usa 6). Por eso NO se reutiliza `claveDesdeCurp`.
 *  - La identidad de la cuenta NO depende del valor de `usuario`; depende de
 *    `tutor_id` y de la relación en `tutor_alumnos`.
 */

const SELECT_TUTOR =
  "id, clave_tutor, nombre, apellidos, curp, telefono, correo, usuario, password_hash, debe_cambiar_credenciales, activo, created_at, updated_at";

/**
 * Contraseña inicial del tutor = últimos 8 caracteres del CURP del alumno de

 * referencia. Regla distinta a `claveDesdeCurp` (alumnos, 6 caracteres), por
 * eso es una función propia y no se reutiliza la de alumnos.
 */
export function contraseñaInicialTutorDesdeCurp(curp: string): string {
  const c = curp.trim().toUpperCase();
  if (!c) return "";
  return c.slice(-8);
}

// ---------------------------------------------------------------------------
// Hash de contraseña con scrypt (node:crypto, sin dependencias nuevas).
// Formato almacenado: "salt:hash" (ambos en base64url).
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;

/** Genera el hash scrypt de una contraseña con un salt aleatorio. */
export function hashContraseñaTutor(contraseña: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(contraseña, salt, SCRYPT_KEYLEN);
  return `${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

/**
 * Verifica una contraseña contra un hash scrypt almacenado.
 *
 * La comparación es INSENSIBLE a mayúsculas/minúsculas (mismo criterio que
 * `clavesCoinciden` de profesores/alumnos): se prueba la contraseña tal cual y
 * en mayúsculas. Esto es necesario porque la contraseña inicial se deriva del
 * CURP (que es mayúsculas) y el formulario de login muestra el campo en
 * mayúsculas (CSS `uppercase`); sin esto, un tutor que escribe su contraseña
 * inicial en minúsculas no podría iniciar sesión.
 */
export function verificarContraseñaTutor(
  contraseña: string,
  hashAlmacenado: string | null,
): boolean {
  if (!hashAlmacenado) return false;
  const [saltB64, hashB64] = hashAlmacenado.split(":");
  if (!saltB64 || !hashB64) return false;
  try {
    const salt = Buffer.from(saltB64, "base64url");
    const esperado = Buffer.from(hashB64, "base64url");
    const candidatos = [contraseña, contraseña.toUpperCase()];
    for (const candidato of candidatos) {
      const calculado = scryptSync(candidato, salt, SCRYPT_KEYLEN);
      if (esperado.length === calculado.length && timingSafeEqual(esperado, calculado)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}


// ---------------------------------------------------------------------------
// Credenciales iniciales MULTI-HIJO (Bloque 6L).
//
// Un tutor con 2+ hijos puede iniciar sesión con los últimos 8 caracteres del
// CURP de CUALQUIERA de sus hijos (no solo del alumno de referencia). Para
// ello se guarda una fila por hijo en `tutor_credenciales_iniciales`, cada una
// con el hash scrypt de la contraseña derivada de ESE hijo.
//
// Reglas:
//  - La contraseña se guarda SIEMPRE como hash scrypt (nunca texto plano).
//  - Cuando el tutor cambia sus credenciales (debe_cambiar_credenciales=false),
//    estas filas se ELIMINAN para que las contraseñas iniciales dejen de ser
//    válidas.
// ---------------------------------------------------------------------------

export type CredencialInicialTutor = {
  curp_alumno: string;
  contraseñaInicial: string;
};

/**
 * Guarda una fila por hijo en `tutor_credenciales_iniciales`, con el hash de
 * los últimos 8 del CURP de ESE hijo. Se usa al crear un tutor (o al migrar
 * tutores existentes). No borra filas previas; para reemplazar usa
 * `reemplazarCredencialesIniciales`.
 */
export async function guardarCredencialesIniciales(
  supabase: SupabaseClient,
  tutorId: string,
  curpsAlumnos: string[],
): Promise<void> {
  const curps = [...new Set(curpsAlumnos.map((c) => c.trim().toUpperCase()))].filter(
    Boolean,
  );
  if (!tutorId || curps.length === 0) return;
  const filas = curps
    .map((curp) => {
      const contraseña = contraseñaInicialTutorDesdeCurp(curp);
      if (!contraseña) return null;
      return {
        tutor_id: tutorId,
        curp_alumno: curp,
        password_hash: hashContraseñaTutor(contraseña),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  if (filas.length === 0) return;
  await supabase.from(TABLA_TUTOR_CREDENCIALES_INICIALES).insert(filas);
}

/**
 * Reemplaza las credenciales iniciales de un tutor por las de los hijos dados:
 * borra las filas previas y guarda las nuevas. Se usa al consolidar hermanos
 * (el tutor nuevo pasa a cubrir a todos los hijos seleccionados).
 */
export async function reemplazarCredencialesIniciales(
  supabase: SupabaseClient,
  tutorId: string,
  curpsAlumnos: string[],
): Promise<void> {
  if (!tutorId) return;
  await supabase
    .from(TABLA_TUTOR_CREDENCIALES_INICIALES)
    .delete()
    .eq("tutor_id", tutorId);
  await guardarCredencialesIniciales(supabase, tutorId, curpsAlumnos);
}

/**
 * Elimina TODAS las credenciales iniciales de un tutor. Se llama cuando el
 * tutor cambia sus credenciales (debe_cambiar_credenciales=false), para que
 * las contraseñas iniciales derivadas del CURP dejen de ser válidas.
 */
export async function eliminarCredencialesIniciales(
  supabase: SupabaseClient,
  tutorId: string,
): Promise<void> {
  if (!tutorId) return;
  await supabase
    .from(TABLA_TUTOR_CREDENCIALES_INICIALES)
    .delete()
    .eq("tutor_id", tutorId);
}

/**
 * Verifica una contraseña contra TODAS las credenciales iniciales del tutor
 * (acepta los últimos 8 del CURP de cualquiera de sus hijos). Devuelve true si
 * coincide con al menos una. Se usa SOLO cuando `debe_cambiar_credenciales`
 * es true (el tutor aún no ha cambiado su contraseña).
 */
export async function verificarContraseñaInicialMultiHijo(
  supabase: SupabaseClient,
  tutorId: string,
  contraseña: string,
): Promise<boolean> {
  if (!tutorId || !contraseña) return false;
  const { data, error } = await supabase
    .from(TABLA_TUTOR_CREDENCIALES_INICIALES)
    .select("password_hash")
    .eq("tutor_id", tutorId);
  if (error || !data) return false;
  for (const r of data as { password_hash: string }[]) {
    if (verificarContraseñaTutor(contraseña, r.password_hash)) return true;
  }
  return false;
}

/**
 * Lista las credenciales iniciales de un tutor (para mostrarlas al directivo).
 * Devuelve el CURP del hijo y la contraseña inicial derivada (últimos 8 del
 * CURP). La contraseña se RECONSTRUYE desde el CURP (no se lee el hash), por
 * lo que no se expone ningún hash.
 */
export async function listarCredencialesInicialesDeTutor(
  supabase: SupabaseClient,
  tutorId: string,
): Promise<CredencialInicialTutor[]> {
  if (!tutorId) return [];
  const { data, error } = await supabase
    .from(TABLA_TUTOR_CREDENCIALES_INICIALES)
    .select("curp_alumno")
    .eq("tutor_id", tutorId);
  if (error || !data) return [];
  return (data as { curp_alumno: string }[])
    .map((r) => ({
      curp_alumno: r.curp_alumno,
      contraseñaInicial: contraseñaInicialTutorDesdeCurp(r.curp_alumno),
    }))
    .filter((c) => c.contraseñaInicial !== "");
}

/**
 * O9 — Batch de credenciales iniciales para VARIOS tutores en pocas consultas
 * (`in(tutor_id)` en lotes de 50, ejecutados en paralelo). Devuelve un Map
 * tutor_id → CredencialInicialTutor[].
 *
 * Reemplaza el N+1 del panel directivo (1 query por tutor → ~N/50 queries).
 * El lote evita el desbordamiento de URL de PostgREST (medido: 463 UUIDs en
 * un solo `in()` provoca `UND_ERR_HEADERS_OVERFLOW`).
 * Preserva la semántica de `listarCredencialesInicialesDeTutor`:
 *  - la contraseña se RECONSTRUYE desde el CURP (nunca se expone el hash);
 *  - tutores sin credenciales no aparecen en el mapa (el llamador usa `[]`);
 *  - la relación tutor ↔ credencial se mantiene por `tutor_id`.
 * El orden DENTRO de cada tutor puede variar (antes no había `.order()`);
 * el orden de los TUTORES lo controla el llamador.
 */
const TAMANO_LOTE_IDS = 50;

export async function listarCredencialesInicialesDeTutores(
  supabase: SupabaseClient,
  tutorIds: readonly string[],
): Promise<Map<string, CredencialInicialTutor[]>> {
  const ids = [...new Set(tutorIds.map((x) => x.trim()).filter(Boolean))];
  const mapa = new Map<string, CredencialInicialTutor[]>();
  if (ids.length === 0) return mapa;

  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += TAMANO_LOTE_IDS) {
    lotes.push(ids.slice(i, i + TAMANO_LOTE_IDS));
  }

  const resultados = await Promise.all(
    lotes.map(async (lote) => {
      const { data, error } = await supabase
        .from(TABLA_TUTOR_CREDENCIALES_INICIALES)
        .select("tutor_id, curp_alumno")
        .in("tutor_id", lote);
      return (error || !data ? [] : data) as {
        tutor_id: string;
        curp_alumno: string;
      }[];
    }),
  );

  for (const filas of resultados) {
    for (const r of filas) {
      const contraseña = contraseñaInicialTutorDesdeCurp(r.curp_alumno);
      if (!contraseña) continue;
      const arr = mapa.get(r.tutor_id) ?? [];
      arr.push({ curp_alumno: r.curp_alumno, contraseñaInicial: contraseña });
      mapa.set(r.tutor_id, arr);
    }
  }
  return mapa;
}


// ---------------------------------------------------------------------------
// Generación de clave_tutor (TUT-XXXXXXXX).
// ---------------------------------------------------------------------------


const CARACTERES_CLAVE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I/L
const LONGITUD_CLAVE = 8;

/** Genera una clave_tutor aleatoria con formato `TUT-XXXXXXXX`. */
export function generarClaveTutor(): string {
  const bytes = randomBytes(LONGITUD_CLAVE);
  let clave = "";
  for (let i = 0; i < LONGITUD_CLAVE; i++) {
    clave += CARACTERES_CLAVE[bytes[i] % CARACTERES_CLAVE.length];
  }
  return `TUT-${clave}`;
}

// ---------------------------------------------------------------------------
// Consultas.
// ---------------------------------------------------------------------------

/** Busca un tutor por su clave pública (TUT-XXXXXXXX). */
export async function buscarTutorPorClaveTutor(
  supabase: SupabaseClient,
  claveTutor: string,
): Promise<TutorRow | null> {
  const key = claveTutor.trim().toUpperCase();
  if (!key) return null;
  const { data, error } = await supabase
    .from(TABLA_TUTORES)
    .select(SELECT_TUTOR)
    .eq("clave_tutor", key)
    .maybeSingle();
  if (error || !data) return null;
  return data as TutorRow;
}

/**
 * Busca un tutor por su usuario de login (correo o usuario).
 *
 * La comparación es INSENSIBLE a mayúsculas/minúsculas (ILIKE) porque el
 * formulario de login muestra el campo en mayúsculas (CSS `uppercase`) y el
 * `usuario` se almacena en minúsculas/mixto (p. ej. "tutor Juan Pérez"). Sin
 * esto, un tutor que escribe su usuario en mayúsculas no podría iniciar sesión.
 *
 * Se escapan los comodines de ILIKE (`%`, `_`, `\`) para que el valor se
 * compare literalmente y no como patrón.
 */
export async function buscarTutorPorUsuario(
  supabase: SupabaseClient,
  usuario: string,
): Promise<TutorRow | null> {
  const key = usuario.trim();
  if (!key) return null;
  const patron = key.replace(/[\\%_]/g, (m) => `\\${m}`);
  const { data, error } = await supabase
    .from(TABLA_TUTORES)
    .select(SELECT_TUTOR)
    .ilike("usuario", patron)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as TutorRow;
}


/** Busca un tutor por su id (UUID). */
export async function buscarTutorPorId(
  supabase: SupabaseClient,
  id: string,
): Promise<TutorRow | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from(TABLA_TUTORES)
    .select(SELECT_TUTOR)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as TutorRow;
}

/** ¿Existe un tutor con la clave_tutor dada? (para evitar reutilizarla). */
export async function existeClaveTutor(
  supabase: SupabaseClient,
  claveTutor: string,
): Promise<boolean> {
  const key = claveTutor.trim().toUpperCase();
  if (!key) return false;
  const { data, error } = await supabase
    .from(TABLA_TUTORES)
    .select("id")
    .eq("clave_tutor", key)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/** ¿Existe un tutor con el usuario dado? (para validar unicidad). */
export async function existeUsuarioTutor(
  supabase: SupabaseClient,
  usuario: string,
): Promise<boolean> {
  const key = usuario.trim();
  if (!key) return false;
  const { data, error } = await supabase
    .from(TABLA_TUTORES)
    .select("id")
    .eq("usuario", key)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/**
 * Genera un `usuario` de login ÚNICO a partir de una base legible, aplicando
 * el MISMO patrón de unicidad que `clave_tutor`: verifica en la base de datos
 * (sin filtrar por `activo`, porque el UNIQUE constraint aplica a todas las
 * filas, incluidas las desactivadas) y, si choca, añade un sufijo numérico
 * incremental: "tutor Juan Pérez", "tutor Juan Pérez 2", "tutor Juan Pérez 3"…
 *
 * Esto evita el choque al consolidar: un alumno que ya tenía un tutor previo
 * (ahora desactivado) dejó ocupado ese `usuario`, y el tutor nuevo no puede
 * reutilizarlo.
 */
export async function generarUsuarioUnico(
  supabase: SupabaseClient,
  base: string,
): Promise<string> {
  const limpio = base.trim();
  if (!limpio) return "";
  let candidato = limpio;
  let sufijo = 2;
  while (await existeUsuarioTutor(supabase, candidato)) {
    candidato = `${limpio} ${sufijo}`;
    sufijo++;
  }
  return candidato;
}


// ---------------------------------------------------------------------------
// Relaciones tutor ↔ alumnos.
// ---------------------------------------------------------------------------

/** Lista los CURP de los alumnos activos de un tutor. */
export async function listarCurpsDeTutor(
  supabase: SupabaseClient,
  tutorId: string,
): Promise<string[]> {
  if (!tutorId) return [];
  const { data, error } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("curp_alumno")
    .eq("tutor_id", tutorId)
    .eq("activo", true);
  if (error || !data) return [];
  return (data as { curp_alumno: string }[]).map((r) => r.curp_alumno);
}

/**
 * FASE 2 — Alumnos de un tutor (relación activa) con su nombre completo.
 * Una sola consulta a ALUMNOS por lotes (`in`) — sin N+1.
 */
export async function listarAlumnosDeTutor(
  supabase: SupabaseClient,
  tutorId: string,
): Promise<{ curp: string; nombre: string }[]> {
  const curps = await listarCurpsDeTutor(supabase, tutorId);
  if (curps.length === 0) return [];

  const porCurp = new Map<string, string>();
  const TAMANO_LOTE = 50;
  for (let i = 0; i < curps.length; i += TAMANO_LOTE) {
    const lote = curps.slice(i, i + TAMANO_LOTE);
    const { data, error } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO")
      .in("CURP", lote);
    if (error || !data) continue;
    for (const r of data as AlumnoRow[]) {
      porCurp.set(String(r.CURP ?? "").trim().toUpperCase(), nombreCompletoAlumno(r));
    }
  }

  return curps.map((curp) => ({
    curp,
    nombre: porCurp.get(curp.trim().toUpperCase()) ?? curp,
  }));
}

/**
 * FASE 2 — Tutor PRINCIPAL activo de un alumno (o el primer tutor activo si no
 * hay relación «principal»). Fuente de verdad de la información de contacto
 * del tutor para el perfil del alumno.
 */
export async function obtenerTutorPrincipalDeAlumno(
  supabase: SupabaseClient,
  curp: string,
): Promise<TutorRow | null> {
  const c = curp.trim().toUpperCase();
  if (!c) return null;
  const { data, error } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("tutor_id")
    .eq("curp_alumno", c)
    .eq("activo", true)
    .order("tipo_relacion", { ascending: true }) // 'principal' < 'secundario'
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return buscarTutorPorId(supabase, data.tutor_id);
}

/** ¿El tutor tiene relación activa con el alumno (CURP)? */
export async function tutorTieneAlumno(
  supabase: SupabaseClient,
  tutorId: string,
  curpAlumno: string,
): Promise<boolean> {
  if (!tutorId || !curpAlumno) return false;
  const key = curpAlumno.trim().toUpperCase();
  const { data, error } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("id")
    .eq("tutor_id", tutorId)
    .eq("curp_alumno", key)
    .eq("activo", true)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/** ¿El alumno (CURP) ya tiene un tutor principal activo? */
export async function alumnoTieneTutorPrincipal(
  supabase: SupabaseClient,
  curpAlumno: string,
): Promise<boolean> {
  const key = curpAlumno.trim().toUpperCase();
  if (!key) return false;
  const { data, error } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("id")
    .eq("curp_alumno", key)
    .eq("tipo_relacion", "principal")
    .eq("activo", true)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/** Lista todos los tutores (para el panel del directivo). */
export async function listarTutores(
  supabase: SupabaseClient,
): Promise<TutorRow[]> {
  const { data, error } = await supabase
    .from(TABLA_TUTORES)
    .select(SELECT_TUTOR)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as TutorRow[];
}

/** Obtiene un tutor con los CURP de sus alumnos vinculados. */
export async function obtenerTutorConAlumnos(
  supabase: SupabaseClient,
  id: string,
): Promise<{ tutor: TutorRow; curps: string[] } | null> {
  const tutor = await buscarTutorPorId(supabase, id);
  if (!tutor) return null;
  const curps = await listarCurpsDeTutor(supabase, id);
  return { tutor, curps };
}

/**
 * Cambia las credenciales del tutor (usuario y contraseña) y marca
 * `debe_cambiar_credenciales = false`. Solo el propio tutor autenticado.
 */
export async function cambiarCredencialesTutor(
  supabase: SupabaseClient,
  id: string,
  args: { usuario: string; contraseña: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = args.usuario.trim();
  const contraseña = args.contraseña;
  if (!usuario) return { ok: false, error: "El usuario no puede estar vacío." };
  if (contraseña.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }

  // Si el usuario cambió, verificar que no lo use otro tutor.
  const actual = await buscarTutorPorId(supabase, id);
  if (!actual) return { ok: false, error: "Tutor no encontrado." };
  if (actual.usuario !== usuario) {
    const { data: duplicado, error: errDup } = await supabase
      .from(TABLA_TUTORES)
      .select("id")
      .eq("usuario", usuario)
      .neq("id", id)
      .maybeSingle();
    if (errDup) return { ok: false, error: "No se pudo validar el usuario." };
    if (duplicado) return { ok: false, error: "Ese usuario ya está en uso." };
  }

  const passwordHash = hashContraseñaTutor(contraseña);
  const { error } = await supabase
    .from(TABLA_TUTORES)
    .update({
      usuario,
      password_hash: passwordHash,
      debe_cambiar_credenciales: false,
    })
    .eq("id", id);
  if (error) return { ok: false, error: `Error al guardar: ${error.message}` };

  // Bloque 6L: al cambiar las credenciales, las contraseñas iniciales
  // derivadas del CURP dejan de ser válidas. Se eliminan para que el login
  // solo acepte la nueva contraseña personalizada.
  await eliminarCredencialesIniciales(supabase, id);

  return { ok: true };
}


// ---------------------------------------------------------------------------
// Creación de tutor con sus alumnos (flujo del directivo).
// ---------------------------------------------------------------------------

export type ReemplazoTutor = {
  curp: string;
  tutorIdAnterior: string;
  claveTutorAnterior: string;
};

export type ResultadoCrearTutor =
  | {
      ok: true;
      tutor: TutorRow;
      curpsVinculados: string[];
      credencialesIniciales: {
        clave_tutor: string;
        usuario: string;
        contraseñaInicial: string;
      };
      /** Solo cuando `consolidar` es true: tutores anteriores reemplazados. */
      reemplazos?: ReemplazoTutor[];
      /** Tutores que quedaron sin alumnos y se desactivaron (activo=false). */
      tutoresDesactivados?: string[];
    }
  | { ok: false; error: string };

/**
 * Trae las relaciones ACTIVAS actuales de un conjunto de CURP de alumnos,
 * junto con la `clave_tutor` del tutor al que pertenecen. Una sola consulta
 * (sin N+1). Se usa para detectar tutores previos al consolidar.
 */
export async function obtenerTutoresActivosDeAlumnos(
  supabase: SupabaseClient,
  curps: string[],
): Promise<Map<string, { tutor_id: string; clave_tutor: string }>> {
  const mapa = new Map<string, { tutor_id: string; clave_tutor: string }>();
  const claves = [...new Set(curps.map((c) => c.trim().toUpperCase()))].filter(Boolean);
  if (claves.length === 0) return mapa;

  const { data, error } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select(`curp_alumno, tutor_id, tutores!inner(clave_tutor)`)
    .in("curp_alumno", claves)
    .eq("activo", true);
  if (error || !data) return mapa;

  for (const r of data as {
    curp_alumno: string;
    tutor_id: string;
    tutores: { clave_tutor: string } | { clave_tutor: string }[];
  }[]) {
    const curp = String(r?.curp_alumno ?? "").trim().toUpperCase();
    if (!curp || !r?.tutor_id) continue;
    const tutor = Array.isArray(r.tutores) ? r.tutores[0] : r.tutores;
    mapa.set(curp, {
      tutor_id: r.tutor_id,
      clave_tutor: tutor?.clave_tutor ?? "",
    });
  }
  return mapa;
}

/**
 * Desactiva (`activo = false`) las relaciones de `tutor_alumnos` de los CURP
 * dados que estén activas. Preserva el registro para auditoría (no borra).
 *
 * `exceptoTutorId` (opcional): si se pasa, NO se desactivan las relaciones del
 * tutor indicado. Es necesario al consolidar, porque el tutor nuevo ya creó sus
 * relaciones activas y no deben tocarse.
 */
export async function desactivarRelacionesDeAlumnos(
  supabase: SupabaseClient,
  curps: string[],
  exceptoTutorId?: string,
): Promise<void> {
  const claves = [...new Set(curps.map((c) => c.trim().toUpperCase()))].filter(Boolean);
  if (claves.length === 0) return;
  let query = supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .update({ activo: false })
    .in("curp_alumno", claves)
    .eq("activo", true);
  if (exceptoTutorId) {
    query = query.neq("tutor_id", exceptoTutorId);
  }
  await query;
}


/**
 * Para cada tutor dado, si NO tiene NINGUNA relación activa en `tutor_alumnos`,
 * lo marca `activo = false` (cuenta huérfana sin alumnos). No lo borra.
 * Devuelve los ids de los tutores que quedaron desactivados.
 */
export async function desactivarTutoresHuerfanos(
  supabase: SupabaseClient,
  tutorIds: string[],
): Promise<string[]> {
  const ids = [...new Set(tutorIds)].filter(Boolean);
  if (ids.length === 0) return [];
  const desactivados: string[] = [];

  for (const id of ids) {
    const { data, error } = await supabase
      .from(TABLA_TUTOR_ALUMNOS)
      .select("id")
      .eq("tutor_id", id)
      .eq("activo", true)
      .limit(1);
    if (error) continue;
    // Sin relaciones activas → huérfano.
    if (!data || data.length === 0) {
      await supabase.from(TABLA_TUTORES).update({ activo: false }).eq("id", id);
      desactivados.push(id);
    }
  }
  return desactivados;
}

/**
 * Crea un tutor con sus relaciones a alumnos (flujo controlado por directivo).
 *
 * - Genera `clave_tutor` única (verifica que no exista).
 * - Genera `usuario` inicial = "tutor " + nombreCompletoAlumno(alumnoReferencia).
 * - Genera contraseña inicial = últimos 8 del CURP del alumno de referencia.
 * - Guarda SOLO el hash scrypt de la contraseña (nunca texto plano).
 * - `debe_cambiar_credenciales = true` (el tutor debe cambiarlas en su primer
 *   login).
 * - Crea las relaciones en `tutor_alumnos` (tipo_relacion = 'principal').
 *
 * Si `consolidar` es true (Bloque 6C), además:
 *   - Detecta las relaciones ACTIVAS previas de los CURP seleccionados.
 *   - Las desactiva (`activo = false`), preservando el registro para auditoría.
 *   - Desactiva los tutores que queden sin NINGÚN alumno activo (huérfanos).
 *   - Devuelve el detalle de reemplazos y tutores desactivados.
 *
 * `alumnoReferenciaParaUsuario` es el primer alumno seleccionado; solo se usa
 * para construir el string inicial del login. No tiene relación con el campo
 * `tipo_relacion` de `tutor_alumnos`.
 */
export async function crearTutorConAlumnos(
  supabase: SupabaseClient,
  args: {
    nombre?: string;
    apellidos?: string;
    curp?: string;
    telefono?: string;
    correo?: string;
    curpsAlumnos: string[];
    alumnoReferenciaParaUsuario: {
      curp: string;
      nombreCompleto: string;
    };
    consolidar?: boolean;
  },
): Promise<ResultadoCrearTutor> {
  const curps = [...new Set(args.curpsAlumnos.map((c) => c.trim().toUpperCase()))].filter(
    Boolean,
  );
  if (curps.length === 0) {
    return { ok: false, error: "Selecciona al menos un alumno." };
  }

  // Bloque 6C: detectar tutores previos activos de los alumnos seleccionados.
  const consolidar = args.consolidar === true;
  const tutoresPrevios = consolidar
    ? await obtenerTutoresActivosDeAlumnos(supabase, curps)
    : new Map<string, { tutor_id: string; clave_tutor: string }>();

  // Generar clave_tutor única.
  let claveTutor = generarClaveTutor();
  let intentos = 0;
  while ((await existeClaveTutor(supabase, claveTutor)) && intentos < 10) {
    claveTutor = generarClaveTutor();
    intentos++;
  }
  if (intentos >= 10) {
    return { ok: false, error: "No se pudo generar una clave de tutor única." };
  }

  // Usuario inicial y contraseña inicial desde el alumno de referencia.
  // El usuario se genera ÚNICO (mismo patrón que clave_tutor): si el string
  // base ya está ocupado por otro tutor (aunque esté desactivado, porque el
  // UNIQUE constraint aplica a todas las filas), se añade un sufijo numérico.
  const usuarioBase = `tutor ${args.alumnoReferenciaParaUsuario.nombreCompleto}`.trim();
  const usuarioInicial = await generarUsuarioUnico(supabase, usuarioBase);
  const contraseñaInicial = contraseñaInicialTutorDesdeCurp(
    args.alumnoReferenciaParaUsuario.curp,
  );
  if (!contraseñaInicial) {
    return { ok: false, error: "El CURP del alumno de referencia no es válido." };
  }
  const passwordHash = hashContraseñaTutor(contraseñaInicial);


  // Insertar el tutor.
  const { data: tutor, error: errTutor } = await supabase
    .from(TABLA_TUTORES)
    .insert({
      clave_tutor: claveTutor,
      nombre: args.nombre?.trim() || null,
      apellidos: args.apellidos?.trim() || null,
      curp: args.curp?.trim().toUpperCase() || null,
      telefono: args.telefono?.trim() || null,
      correo: args.correo?.trim() || null,
      usuario: usuarioInicial,
      password_hash: passwordHash,
      debe_cambiar_credenciales: true,
      activo: true,
    })
    .select(SELECT_TUTOR)
    .single();

  if (errTutor || !tutor) {
    return {
      ok: false,
      error: `Error al crear el tutor: ${errTutor?.message ?? "sin datos"}`,
    };
  }

  // Crear las relaciones con los alumnos.
  const filasRelacion = curps.map((curp) => ({
    tutor_id: tutor.id,
    curp_alumno: curp,
    tipo_relacion: "principal",
    activo: true,
  }));
  const { error: errRel } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .insert(filasRelacion);
  if (errRel) {
    // Si falla la relación, limpiar el tutor creado para no dejar huérfanos.
    await supabase.from(TABLA_TUTORES).delete().eq("id", tutor.id);
    return {
      ok: false,
      error: `Error al vincular alumnos: ${errRel.message}`,
    };
  }

  // Bloque 6L: guardar una credencial inicial por hijo (acepta los últimos 8
  // del CURP de cualquiera de sus hijos). Si falla, no bloquea la creación:
  // el tutor ya existe y el login seguirá funcionando con el hash de
  // `tutores.password_hash` (alumno de referencia).
  await guardarCredencialesIniciales(supabase, tutor.id, curps);

  // Bloque 6C: desactivar relaciones previas y tutores huérfanos.

  let reemplazos: ReemplazoTutor[] | undefined;
  let tutoresDesactivados: string[] | undefined;
  if (consolidar && tutoresPrevios.size > 0) {
    // Desactivar las relaciones activas previas de los alumnos seleccionados,
    // PERO nunca las del tutor recién creado (exceptoTutorId).
    await desactivarRelacionesDeAlumnos(supabase, curps, tutor.id);


    // Detalle de reemplazos (para el resumen de la UI).
    reemplazos = curps
      .map((curp) => {
        const previo = tutoresPrevios.get(curp);
        return previo
          ? {
              curp,
              tutorIdAnterior: previo.tutor_id,
              claveTutorAnterior: previo.clave_tutor,
            }
          : null;
      })
      .filter((r): r is ReemplazoTutor => r !== null);

    // Desactivar tutores que quedaron sin alumnos activos.
    const idsPrevios = [...new Set(reemplazos.map((r) => r.tutorIdAnterior))];
    tutoresDesactivados = await desactivarTutoresHuerfanos(supabase, idsPrevios);
  }

  return {
    ok: true,
    tutor: tutor as TutorRow,
    curpsVinculados: curps,
    credencialesIniciales: {
      clave_tutor: claveTutor,
      usuario: usuarioInicial,
      contraseñaInicial,
    },
    ...(reemplazos ? { reemplazos } : {}),
    ...(tutoresDesactivados ? { tutoresDesactivados } : {}),
  };
}


// ---------------------------------------------------------------------------
// Generación masiva de tutores (Bloque 6B).
// ---------------------------------------------------------------------------

/**
 * Trae todos los CURP de alumnos que YA tienen un tutor activo (una sola
 * consulta, sin N+1). Se usa para excluir de la generación automática a
 * quienes ya están cubiertos, aunque se hayan creado en sesiones anteriores.
 */
async function traerCurpsConTutorActivo(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const cubiertos = new Set<string>();
  const { data, error } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("curp_alumno")
    .eq("activo", true);
  if (error) return cubiertos;
  for (const r of data as { curp_alumno: string }[]) {
    const c = String(r?.curp_alumno ?? "").trim().toUpperCase();
    if (c) cubiertos.add(c);
  }
  return cubiertos;
}

export type PrevisualizacionGeneracionTutores = {
  totalAlumnos: number;
  sinTutor: number;
  conTutor: number;
};

/**
 * Previsualiza la generación masiva SIN crear nada: cuenta cuántos alumnos
 * existen, cuántos ya tienen tutor y cuántos se procesarían.
 */
export async function previsualizarGeneracionTutores(
  supabase: SupabaseClient,
): Promise<PrevisualizacionGeneracionTutores> {
  const alumnos = await traerAlumnosExistentes(supabase);
  const cubiertos = await traerCurpsConTutorActivo(supabase);
  let sinTutor = 0;
  for (const a of alumnos) {
    const curp = String(a?.CURP ?? "").trim().toUpperCase();
    if (curp && !cubiertos.has(curp)) sinTutor++;
  }
  return {
    totalAlumnos: alumnos.length,
    sinTutor,
    conTutor: alumnos.length - sinTutor,
  };
}

export type FilaCredencialesCsv = {
  clave_tutor: string;
  usuario: string;
  contraseñaInicial: string;
  alumnoVinculado: string;
};

export type ResultadoGeneracionTutores = {
  ok: true;
  procesados: number;
  creados: number;
  omitidos: number;
  omitidosDetalle: string[];
  errores: number;
  erroresDetalle: string[];
  csv: string;
  filasCsv: FilaCredencialesCsv[];
};

/**
 * Genera un tutor individual (grupo de 1 alumno) para TODOS los alumnos que
 * aún no tienen tutor activo. Reutiliza `crearTutorConAlumnos` (Bloque 6A).
 *
 * - Consulta una sola vez los CURP ya cubiertos (Set en memoria) para evitar
 *   N+1 y para que funcione en varias sesiones/días.
 * - Un alumno con datos corruptos NO detiene la corrida: se reporta como error
 *   puntual y se continúa con el resto.
 * - Devuelve el CSV con las credenciales iniciales de los recién creados
 *   (solo en memoria, nunca se persiste la contraseña en texto plano).
 */
export async function generarTutoresAutomaticos(
  supabase: SupabaseClient,
): Promise<ResultadoGeneracionTutores> {
  const alumnos = await traerAlumnosExistentes(supabase);
  const cubiertos = await traerCurpsConTutorActivo(supabase);

  const omitidosDetalle: string[] = [];
  const erroresDetalle: string[] = [];
  const filasCsv: FilaCredencialesCsv[] = [];
  let creados = 0;

  for (const alumno of alumnos) {
    const curp = String(alumno?.CURP ?? "").trim().toUpperCase();
    if (!curp) {
      erroresDetalle.push("Alumno sin CURP (fila omitida).");
      continue;
    }
    if (cubiertos.has(curp)) {
      omitidosDetalle.push(
        `${nombreCompletoAlumno(alumno)} (${curp}) — ya tenía tutor`,
      );
      continue;
    }

    const nombreCompleto = nombreCompletoAlumno(alumno);
    const resultado = await crearTutorConAlumnos(supabase, {
      curpsAlumnos: [curp],
      alumnoReferenciaParaUsuario: { curp, nombreCompleto },
    });

    if (!resultado.ok) {
      erroresDetalle.push(`${nombreCompleto} (${curp}): ${resultado.error}`);
      continue;
    }

    creados++;
    filasCsv.push({
      clave_tutor: resultado.credencialesIniciales.clave_tutor,
      usuario: resultado.credencialesIniciales.usuario,
      contraseñaInicial: resultado.credencialesIniciales.contraseñaInicial,
      alumnoVinculado: nombreCompleto,
    });
  }

  const csv = matrizACsvTexto([
    ["clave_tutor", "usuario", "contraseña_inicial", "alumno_vinculado"],
    ...filasCsv.map((f) => [
      f.clave_tutor,
      f.usuario,
      f.contraseñaInicial,
      f.alumnoVinculado,
    ]),
  ]);

  return {
    ok: true,
    procesados: alumnos.length,
    creados,
    omitidos: omitidosDetalle.length,
    omitidosDetalle,
    errores: erroresDetalle.length,
    erroresDetalle,
    csv,
    filasCsv,
  };
}


