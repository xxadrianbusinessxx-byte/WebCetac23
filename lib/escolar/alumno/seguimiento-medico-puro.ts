/**
 * seguimiento-medico-puro.ts — MÓDULO PURO. Las tres decisiones del historial
 * del seguimiento médico que no necesitan base de datos:
 *
 *   1. QUIÉN edita: el editor sale de la sesión firmada, nunca del navegador.
 *      Padre por `tutores.id`; dirección y administración por `PROFESORES.ID`,
 *      nunca por CLAVE (16 de 20 profesores comparten la misma).
 *   2. QUÉ se audita: solo los campos del apartado «Seguimiento médico»
 *      (`CAMPOS_SEGUIMIENTO_MEDICO`). «Información personal» se guarda por el
 *      mismo camino y NO deja historial.
 *   3. CÓMO se lee una entrada: rol legible, fecha y hora del plantel, y cada
 *      cambio con su etiqueta amigable.
 *
 * Lo que NO decide: si un valor cambió. Eso lo compara la función
 * `guardar_campos_personales_alumno` (supabase/crear-historial-seguimiento-medico.sql)
 * con la fila bloqueada, en la misma transacción que la escritura: un «antes»
 * leído aquí podría estar viejo.
 */
import type { PortalSessionPayload } from "../../auth/types.ts";
import { fechaHoraLocal } from "../administracion/hora-plantel-puro.ts";
import type { CampoPersonalPrimario } from "./etiquetas.ts";
import { CAMPOS_SEGUIMIENTO_MEDICO } from "./grupos-campos-personales.ts";
import { etiquetaCampoPersonal } from "./informacion-personal.ts";

/** Los únicos roles que editan el seguimiento médico (`resolverAccesoAlumno`). */
export type RolEditorMedico = "tutor" | "directivo" | "administracion";

/** Quién firma una edición. Exactamente uno de los dos ids, el de su rol. */
export type EditorSeguimientoMedico = {
  rol: RolEditorMedico;
  profesorId: number | null;
  tutorId: string | null;
  nombre: string | null;
};

/** Una fila de `seguimiento_medico_historial` tal como llega de PostgREST. */
export type FilaHistorialMedico = {
  id: number;
  editor_rol: string;
  editor_nombre: string | null;
  cambios: unknown;
  editado_at: string;
};

export type CambioMedico = {
  campo: string;
  etiqueta: string;
  antes: string | null;
  despues: string | null;
};

/** Una entrada lista para pintar. */
export type EntradaHistorialMedico = {
  id: number;
  /** «YYYY-MM-DD» en la hora del plantel; "" si el instante no es válido. */
  fecha: string;
  /** «HH:MM» en la hora del plantel; "" si el instante no es válido. */
  hora: string;
  /** «Padre o tutor», «Dirección», «Administración escolar». */
  quien: string;
  nombre: string | null;
  cambios: CambioMedico[];
};

/** Cuántas ediciones se muestran. Las más recientes; el resto sigue en la tabla. */
export const LIMITE_HISTORIAL_MEDICO = 50;

export const ETIQUETA_ROL_EDITOR: Readonly<Record<RolEditorMedico, string>> = {
  tutor: "Padre o tutor",
  directivo: "Dirección",
  administracion: "Administración escolar",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El editor de una sesión, o `null` si esa sesión no puede firmar una edición
 * médica (alumno, profesor, técnico) o le falta la identidad estructural. Con
 * `null` no se guarda: una edición médica sin autor es justo lo que se evita.
 */
export function editorDesdeSesion(
  sesion: Pick<PortalSessionPayload, "rol" | "matricula" | "profesorId" | "nombre"> | null,
): EditorSeguimientoMedico | null {
  if (!sesion) return null;
  const nombre = sesion.nombre?.trim() || null;

  if (sesion.rol === "tutor") {
    // En la sesión del tutor, `matricula` ES `tutores.id` (portal-login.ts).
    const tutorId = (sesion.matricula ?? "").trim();
    if (!UUID.test(tutorId)) return null;
    return { rol: "tutor", profesorId: null, tutorId: tutorId.toLowerCase(), nombre };
  }

  if (sesion.rol === "directivo" || sesion.rol === "administracion") {
    const id = sesion.profesorId;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;
    return { rol: sesion.rol, profesorId: id, tutorId: null, nombre };
  }

  return null;
}

/**
 * Las claves del patch que son del seguimiento médico, en el orden del
 * apartado. Es la lista que la función SQL compara antes/después: un patch de
 * «Información personal» da `[]` y no deja historial.
 */
export function camposMedicosDelPatch(
  patch: Readonly<Partial<Record<string, unknown>>>,
): CampoPersonalPrimario[] {
  return CAMPOS_SEGUIMIENTO_MEDICO.filter((c) => Object.hasOwn(patch, c));
}

/**
 * Filas de la tabla → entradas para pintar, la más reciente primero (la base
 * ya las ordena; se reordena por si acaso, con `id` como desempate). Una fila
 * sin ningún cambio legible no se muestra: no diría nada.
 */
export function entradasHistorialMedico(
  filas: readonly FilaHistorialMedico[],
): EntradaHistorialMedico[] {
  return [...filas]
    .sort((a, b) => {
      const ta = instante(a.editado_at);
      const tb = instante(b.editado_at);
      return ta !== tb ? tb - ta : b.id - a.id;
    })
    .map((f) => {
      const local = fechaHoraLocal(f.editado_at);
      const rol = String(f.editor_rol ?? "");
      return {
        id: f.id,
        fecha: local?.fecha ?? "",
        hora: local?.hora ?? "",
        quien: esRolEditor(rol) ? ETIQUETA_ROL_EDITOR[rol] : rol || "Desconocido",
        nombre: textoONull(f.editor_nombre),
        cambios: cambiosDesdeJson(f.cambios),
      };
    })
    .filter((e) => e.cambios.length > 0);
}

// ── Helpers privados ───────────────────────────────────────────────────────

function esRolEditor(x: string): x is RolEditorMedico {
  return Object.hasOwn(ETIQUETA_ROL_EDITOR, x);
}

/** Un instante inválido va al final de la lista, no al principio. */
function instante(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

function textoONull(x: unknown): string | null {
  if (x == null) return null;
  const t = String(x).trim();
  return t || null;
}

/** `cambios` viene de un jsonb: se lee a la defensiva y se descarta lo que no encaja. */
function cambiosDesdeJson(x: unknown): CambioMedico[] {
  if (!Array.isArray(x)) return [];
  const out: CambioMedico[] = [];
  for (const c of x) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const campo = textoONull(r.campo);
    if (!campo) continue;
    out.push({
      campo,
      etiqueta: etiquetaCampoPersonal(campo),
      antes: textoONull(r.antes),
      despues: textoONull(r.despues),
    });
  }
  return out;
}
