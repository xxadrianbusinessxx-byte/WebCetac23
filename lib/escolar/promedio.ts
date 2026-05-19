import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreCompletoAlumno } from "./alumnos";
import type { AlumnoRow } from "./types";
import { normalizarNombre } from "./nombres";
import { obtenerVistaMateria } from "./materias";
import { MATERIAS_ESCOLAR } from "./materias-list";

const CURP_ALUMNO_RE =
  /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/i;

function numerosDeFila(fila: string[]): number[] {
  const nums: number[] = [];
  for (const celda of fila) {
    const t = String(celda ?? "").trim().replace(",", ".");
    if (!t || CURP_ALUMNO_RE.test(t)) continue;
    const n = Number.parseFloat(t);
    if (!Number.isNaN(n) && n >= 0 && n <= 10) nums.push(n);
  }
  return nums;
}

function filaCoincideAlumno(
  fila: string[],
  curp: string,
  nombreNorm: string,
): boolean {
  const curpU = curp.toUpperCase();
  for (const celda of fila) {
    const c = String(celda ?? "").trim();
    if (!c) continue;
    if (c.toUpperCase() === curpU) return true;
    if (normalizarNombre(c) === nombreNorm) return true;
    if (normalizarNombre(c).includes(nombreNorm)) return true;
  }
  return false;
}

/** Promedio a partir de calificaciones en tablas de materias (0 si no hay datos). */
export async function calcularPromedioAlumno(
  supabase: SupabaseClient,
  alumno: AlumnoRow,
): Promise<number> {
  const nombreNorm = normalizarNombre(nombreCompletoAlumno(alumno));
  const muestra = MATERIAS_ESCOLAR.slice(0, 40);
  let suma = 0;
  let cuenta = 0;

  for (const materia of muestra) {
    const vista = await obtenerVistaMateria(supabase, materia);
    if (!vista?.filas.length) continue;

    for (const fila of vista.filas) {
      if (!filaCoincideAlumno(fila, alumno.CURP, nombreNorm)) continue;
      const nums = numerosDeFila(fila);
      for (const n of nums) {
        suma += n;
        cuenta += 1;
      }
    }
  }

  if (cuenta === 0) return 0;
  return Math.round((suma / cuenta) * 100) / 100;
}

export type AlumnoEstrella = {
  alumno: AlumnoRow;
  promedio: number;
  nombre: string;
};

export async function listarAlumnosEstrella(
  supabase: SupabaseClient,
  alumnos: AlumnoRow[],
  limite = 4,
): Promise<AlumnoEstrella[]> {
  const conPromedio: AlumnoEstrella[] = [];

  for (const alumno of alumnos) {
    const promedio = await calcularPromedioAlumno(supabase, alumno);
    conPromedio.push({
      alumno,
      promedio,
      nombre: nombreCompletoAlumno(alumno),
    });
  }

  conPromedio.sort((a, b) => b.promedio - a.promedio);
  return conPromedio.slice(0, limite);
}
