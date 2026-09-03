import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TABLA_ALUMNOS,
  TABLA_CARRERAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
} from "./tables";
import {
  configuracionPermitidaEnPeriodo,
  consultarPeriodo,
} from "./ciclo-estado";

/**
 * F3 — ADMINISTRACIÓN ACADÉMICA DE UN CICLO (preferentemente BORRADOR).
 *
 * Separación conceptual:
 *   - Estas funciones reciben SIEMPRE un periodo/grupo explícito y dependen de
 *     rol autorizado (Server Action) + existencia del periodo + estado
 *     permitido (BORRADOR u OPERATIVO; HISTORICO bloqueado cuando hay esquema).
 *   - NO dependen de `activo=true`. `activo` solo expresa "ciclo operativo".
 *   - Nunca llaman a `setActivoCiclo()` ni modifican el ciclo operativo.
 *
 * Inscripción en BORRADOR: se guarda la fila con `activo=false` (pertenencia
 * preparada) para NO contaminar la resolución del ciclo operativo actual. Al
 * activar el ciclo (F1), `sincronizarInscripcionesOperativo` activa la fila
 * más reciente por CURP del nuevo operativo y apaga las de los demás.
 */

export type GrupoAdminCiclo = {
  id: string;
  grado: string;
  grupo: string;
  carreraId: string | null;
  carreraClave: string;
  activo: boolean;
};

export async function listarGruposPeriodoAdmin(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<{ ok: boolean; grupos?: GrupoAdminCiclo[]; error?: string }> {
  const permiso = await configuracionPermitidaEnPeriodo(supabase, periodoId);
  if (!permiso.ok) return { ok: false, error: permiso.error };

  const { data: grupos, error: eG } = await supabase
    .from(TABLA_GRUPOS)
    .select("id, grado, nombre, carrera_id, activo")
    .eq("periodo_id", periodoId);
  if (eG) return { ok: false, error: eG.message };
  const filas = (grupos ?? []) as Array<{
    id: string;
    grado: string;
    nombre: string;
    carrera_id: string | null;
    activo: boolean;
  }>;

  const carreraIds = [
    ...new Set(filas.map((g) => g.carrera_id).filter((x): x is string => Boolean(x))),
  ];
  const clavePorId = new Map<string, string>();
  if (carreraIds.length > 0) {
    const { data: carreras, error: eC } = await supabase
      .from(TABLA_CARRERAS)
      .select("id, clave")
      .in("id", carreraIds);
    if (eC) return { ok: false, error: eC.message };
    for (const c of (carreras ?? []) as Array<{ id: string; clave: string }>) {
      clavePorId.set(c.id, c.clave);
    }
  }

  return {
    ok: true,
    grupos: filas.map((g) => ({
      id: g.id,
      grado: g.grado,
      grupo: g.nombre,
      carreraId: g.carrera_id,
      carreraClave: g.carrera_id ? (clavePorId.get(g.carrera_id) ?? "") : "",
      activo: Boolean(g.activo),
    })),
  };
}


export type AlumnoCandidato = { curp: string; nombre: string };

/**
 * Búsqueda ACOTADA de alumnos (catálogo ALUMNOS) por CURP o nombre.
 * Usa select(*) y filtra en memoria (volumen ~460 alumnos) para evitar
 * problemas de mayúsculas en identificadores legacy y N+1.
 */
export async function buscarAlumnosCandidatos(
  supabase: SupabaseClient,
  texto: string,
): Promise<{ ok: boolean; alumnos?: AlumnoCandidato[]; error?: string }> {
  const normTexto = (v: unknown) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  const t = normTexto(texto);
  if (!t) return { ok: true, alumnos: [] };
  const { data, error } = await supabase.from(TABLA_ALUMNOS).select("*").limit(2000);
  if (error) return { ok: false, error: error.message };

  type FilaAlumno = { CURP?: string; NOMBRE?: string; P_APELLIDO?: string; S_APELLIDO?: string };
  const resultados: AlumnoCandidato[] = [];
  for (const a of (data ?? []) as FilaAlumno[]) {
    const curp = normTexto(a.CURP);
    if (!curp) continue;
    const nombre = `${a.NOMBRE ?? ""} ${a.P_APELLIDO ?? ""} ${a.S_APELLIDO ?? ""}`.trim();
    if (curp.includes(t) || normTexto(nombre).includes(t)) {
      resultados.push({ curp, nombre });
    }
    if (resultados.length >= 30) break;
  }
  return { ok: true, alumnos: resultados };
}


export type ResultadoInscripcionAdmin =
  | { ok: true; mensaje: string; activo: boolean; periodoNombre: string }
  | { ok: false; error: string; estado?: string };

/**
 * Inscribe/actualiza la pertenencia de un alumno a un grupo de un periodo
 * explícito (BORRADOR u OPERATIVO). Seguridad de datos:
 *   - alumno debe existir (ALUMNOS);
 *   - el grupo debe existir, estar activo y pertenecer al periodo indicado;
 *   - el estado del periodo debe permitir preparación (HISTORICO bloqueado);
 *   - OPERATIVO → fila con activo=true (una sola activa por alumno);
 *   - BORRADOR → fila con activo=false (no contamina la resolución actual).
 */
export async function inscribirAlumnoEnCiclo(
  supabase: SupabaseClient,
  input: { curp: string; grupoId: string; periodoId?: string },
): Promise<ResultadoInscripcionAdmin> {
  const curp = (input.curp ?? "").trim().toUpperCase();
  const grupoId = (input.grupoId ?? "").trim();
  if (!curp) return { ok: false, error: "Indica la CURP del alumno." };
  if (!grupoId) return { ok: false, error: "Indica el grupo destino." };

  // 1) Alumno debe existir (identidad en ALUMNOS).
  const { data: alumnos, error: eA } = await supabase.from(TABLA_ALUMNOS).select("*").limit(2000);
  if (eA) return { ok: false, error: eA.message };
  const existe = ((alumnos ?? []) as Array<{ CURP?: string }>).some(
    (a) => String(a.CURP ?? "").trim().toUpperCase() === curp,
  );
  if (!existe) return { ok: false, error: "El alumno no existe (ALUMNOS).", estado: "no_encontrado" };

  // 2) Grupo real.
  const { data: grupo, error: eG } = await supabase
    .from(TABLA_GRUPOS)
    .select("id, periodo_id, activo")
    .eq("id", grupoId)
    .maybeSingle();
  if (eG) return { ok: false, error: eG.message };
  if (!grupo) return { ok: false, error: "El grupo no existe.", estado: "grupo_inexistente" };
  if (grupo.activo === false) {
    return { ok: false, error: "El grupo destino está inactivo.", estado: "grupo_inactivo" };
  }

  const periodoIdGrupo = String((grupo as { periodo_id?: string | null }).periodo_id ?? "");
  if (!periodoIdGrupo) return { ok: false, error: "El grupo no tiene periodo asociado.", estado: "grupo_sin_periodo" };

  // 3) Referencia cruzada: si se indica el periodo esperado, el grupo debe
  //    pertenecer a ese periodo (el cliente nunca decide el destino real).
  if (input.periodoId && String(input.periodoId).trim() !== periodoIdGrupo) {
    return { ok: false, error: "El grupo pertenece a otro periodo (referencia cruzada bloqueada).", estado: "grupo_de_otro_periodo" };
  }

  // 4) El periodo del grupo debe permitir preparación.
  const permiso = await configuracionPermitidaEnPeriodo(supabase, periodoIdGrupo);
  if (!permiso.ok) return { ok: false, error: permiso.error ?? "El periodo no admite preparación.", estado: "periodo_bloqueado" };

  const consulta = await consultarPeriodo(supabase, periodoIdGrupo);
  const operativo = Boolean(consulta.periodo?.activo);
  const periodoNombre = consulta.periodo?.nombre ?? "";

  // 4) Duplicado en el mismo grupo → idempotente (no se inserta de nuevo).
  const { data: existente } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("id, activo")
    .eq("curp", curp)
    .eq("grupo_id", grupoId)
    .maybeSingle();
  if (existente) {
    return {
      ok: false,
      error: `${curp} ya tiene una inscripción en este grupo del ciclo ${periodoNombre} (no se duplica).`,
      estado: "duplicado_en_grupo",
    };
  }

  // 5) OPERATIVO: una sola fila activa por alumno en todo el sistema.
  if (operativo) {
    const { error: eDes } = await supabase
      .from(TABLA_INSCRIPCIONES_ALUMNO)
      .update({ activo: false })
      .eq("curp", curp)
      .eq("activo", true)
      .neq("grupo_id", grupoId);
    if (eDes) return { ok: false, error: eDes.message };
  }

  const { error: eUp } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .upsert({ curp, grupo_id: grupoId, activo: operativo }, { onConflict: "curp,grupo_id" });
  if (eUp) return { ok: false, error: eUp.message };

  return {
    ok: true,
    activo: operativo,
    periodoNombre,
    mensaje: operativo
      ? `${curp} inscrito en el grupo del ciclo OPERATIVO ${periodoNombre}.`
      : `${curp} registrado en ${periodoNombre} (preparación, activo=false). No afecta al ciclo operativo.`,
  };
}


