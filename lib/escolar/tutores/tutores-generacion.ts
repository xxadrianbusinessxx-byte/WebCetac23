import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreCompletoAlumno, traerAlumnosExistentes } from "../alumno/alumnos";
import { matrizAXlsxBase64 } from "../exportar-xlsx";
import { TABLA_TUTOR_ALUMNOS } from "../tables";
import { crearTutorConAlumnos } from "./tutores-relacion";

/**
 * TUTORES · GENERACIÓN MASIVA (Bloque 6B).
 *
 * Genera un tutor individual para cada alumno que aún no tiene tutor activo y
 * devuelve el .xlsx con las credenciales iniciales (solo en memoria: la
 * contraseña nunca se persiste en texto plano).
 *
 * Es una de las tres partes del antiguo `lib/escolar/tutores/tutores.ts`
 * (PROMPT E · R-3); `tutores.ts` re-exporta las tres.
 */


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
  /** Contenido binario del .xlsx con las credenciales en base64 (para descargar). */
  base64: string;
  nombreArchivo: string;
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
 * - Devuelve el Excel (.xlsx) con las credenciales iniciales de los recién
 *   creados (solo en memoria, nunca se persiste la contraseña en texto plano).
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

  // Entregable SIEMPRE en .xlsx (el CSV corrompe o exporta mal CURP y nombres).
  const base64 = matrizAXlsxBase64(
    [
      ["clave_tutor", "usuario", "contraseña_inicial", "alumno_vinculado"],
      ...filasCsv.map((f) => [
        f.clave_tutor,
        f.usuario,
        f.contraseñaInicial,
        f.alumnoVinculado,
      ]),
    ],
    "Credenciales",
    [18, 28, 28, 60],
  );

  return {
    ok: true,
    procesados: alumnos.length,
    creados,
    omitidos: omitidosDetalle.length,
    omitidosDetalle,
    errores: erroresDetalle.length,
    erroresDetalle,
    base64,
    nombreArchivo: "credenciales_tutores.xlsx",
    filasCsv,
  };
}


