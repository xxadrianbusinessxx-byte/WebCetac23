import type { SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import {
  buscarAlumnoPorNombre,
  nombreCompletoAlumno,
} from "@/lib/escolar/alumnos";
import {
  buscarProfesorPorNombre,
  nombreProfesor,
  rolDesdePermisos,
} from "@/lib/escolar/profesores";
import {
  buscarTutorPorClaveTutor,
  buscarTutorPorUsuario,
  nombreCompletoTutor,
  verificarContraseñaTutor,
} from "@/lib/escolar/tutores";
import type { PortalRole } from "./types";

export type LoginResult = {
  matricula: string;
  rol: PortalRole;
  curp?: string;
  nombre?: string;
};

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function clavesCoinciden(ingresada: string, claveRegistro: string): boolean {
  const a = ingresada.trim();
  const b = claveRegistro.trim();
  return safeEqual(a, b) || safeEqual(a.toUpperCase(), b.toUpperCase());
}

/** Acceso con nombre completo + clave (PROFESORES o ALUMNOS). */
export async function validarAccesoPortal(
  supabase: SupabaseClient,
  nombreCompletoRaw: string,
  clave: string,
): Promise<LoginResult | null> {
  const nombreCompleto = nombreCompletoRaw.trim();
  if (!nombreCompleto || !clave) return null;

  const profesor = await buscarProfesorPorNombre(supabase, nombreCompleto);
  if (profesor && clavesCoinciden(clave, profesor.CLAVE)) {
    const nombre = nombreProfesor(profesor);
    return {
      matricula: profesor.CLAVE,
      rol: rolDesdePermisos(profesor.Permisos),
      nombre,
    };
  }

  const alumno = await buscarAlumnoPorNombre(supabase, nombreCompleto);
  if (alumno && clavesCoinciden(clave, alumno.CLAVE)) {
    return {
      matricula: alumno.CLAVE,
      rol: "alumno",
      curp: alumno.CURP,
      nombre: nombreCompletoAlumno(alumno),
    };
  }

  // Tutor: el campo "nombre" recibe el `usuario` (o la `clave_tutor`) y el
  // campo "clave" recibe la contraseña. La contraseña se verifica contra el
  // hash scrypt almacenado (nunca en texto plano).
  const tutor =
    (await buscarTutorPorUsuario(supabase, nombreCompleto)) ??
    (await buscarTutorPorClaveTutor(supabase, nombreCompleto));
  if (tutor && tutor.activo && verificarContraseñaTutor(clave, tutor.password_hash)) {
    return {
      matricula: tutor.id,
      rol: "tutor",
      curp: tutor.curp ?? undefined,
      nombre: nombreCompletoTutor(tutor),
    };
  }

  return null;
}
