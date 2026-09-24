import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLA_TUTORES, TABLA_TUTOR_CREDENCIALES_INICIALES } from "../tables.ts";
import type { TutorRow } from "./tutores-types.ts";

/**
 * TUTORES · CREDENCIALES (Bloque 6A/6L).
 *
 * Hash scrypt de contraseñas, contraseña inicial (simple y multi-hijo),
 * `tutor_credenciales_iniciales`, clave amigable `TUT-XXXXXXXX`, usuario único y
 * cambio de credenciales del tutor.
 *
 * Es una de las tres partes del antiguo `lib/escolar/tutores/tutores.ts`
 * (PROMPT E · R-3). Las otras dos son `./tutores-relacion.ts` (relación
 * tutor↔alumno) y `./tutores-generacion.ts` (generación masiva). `tutores.ts`
 * queda como fachada que re-exporta las tres, así que ningún import cambia.
 */


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

/**
 * Proyección completa de una fila de `tutores`. La comparten los módulos de la
 * familia (credenciales y relación): es la MISMA lectura para todos.
 */
export const SELECT_TUTOR =
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


