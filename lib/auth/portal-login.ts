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
  verificarContraseñaInicialMultiHijo,
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

/** Acceso con identificador + clave (PROFESORES, ALUMNOS o TUTORES). */
export async function validarAccesoPortal(
  supabase: SupabaseClient,
  identificadorRaw: string,
  clave: string,
): Promise<LoginResult | null> {
  const identificador = identificadorRaw.trim();
  if (!identificador || !clave) return null;

  // [DIAGNÓSTICO TEMPORAL 6J] Log seguro: solo identificador y booleans, NUNCA
  // la clave/contraseña ni hashes. Se eliminará al terminar el diagnóstico.
  console.log("[6J-login] validarAccesoPortal → identificador:", JSON.stringify(identificador));

  const profesor = await buscarProfesorPorNombre(supabase, identificador);
  console.log("[6J-login] buscando profesor → encontrado:", !!profesor);
  if (profesor && clavesCoinciden(clave, profesor.CLAVE)) {
    const nombre = nombreProfesor(profesor);
    console.log("[6J-login] profesor válido → rol:", rolDesdePermisos(profesor.Permisos));
    return {
      matricula: profesor.CLAVE,
      rol: rolDesdePermisos(profesor.Permisos),
      nombre,
    };
  }

  const alumno = await buscarAlumnoPorNombre(supabase, identificador);
  console.log("[6J-login] buscando alumno → encontrado:", !!alumno);
  if (alumno && clavesCoinciden(clave, alumno.CLAVE)) {
    console.log("[6J-login] alumno válido → rol: alumno");
    return {
      matricula: alumno.CLAVE,
      rol: "alumno",
      curp: alumno.CURP,
      nombre: nombreCompletoAlumno(alumno),
    };
  }

  // Tutor: el campo "identificador" recibe el `usuario` (o la `clave_tutor`)
  // y el campo "clave" recibe la contraseña. La contraseña se verifica contra
  // el hash scrypt almacenado (nunca en texto plano).
  console.log("[6J-login] buscando tutor por usuario");
  const tutorPorUsuario = await buscarTutorPorUsuario(supabase, identificador);
  console.log("[6J-login] tutor por usuario → encontrado:", !!tutorPorUsuario);
  const tutorPorClave = tutorPorUsuario ? null : await buscarTutorPorClaveTutor(supabase, identificador);
  console.log("[6J-login] tutor por clave_tutor → encontrado:", !!tutorPorClave);
  const tutor = tutorPorUsuario ?? tutorPorClave;
  console.log("[6J-login] tutor encontrado:", !!tutor);
  console.log("[6J-login] tutor activo:", !!tutor?.activo);
  console.log("[6J-login] tutor debe_cambiar_credenciales:", !!tutor?.debe_cambiar_credenciales);

  // Bloque 6L: verificación de contraseña del tutor.
  //  - Si `debe_cambiar_credenciales` es true (aún no cambió su contraseña),
  //    se acepta la contraseña inicial derivada del CURP de CUALQUIERA de sus
  //    hijos (multi-hijo) O la del alumno de referencia (hash en `tutores`).
  //  - Si `debe_cambiar_credenciales` es false (ya cambió su contraseña), solo
  //    se acepta la contraseña personalizada almacenada en `tutores`.
  let pwValida = false;
  if (tutor) {
    pwValida = verificarContraseñaTutor(clave, tutor.password_hash);
    if (!pwValida && tutor.debe_cambiar_credenciales) {
      pwValida = await verificarContraseñaInicialMultiHijo(supabase, tutor.id, clave);
    }
  }
  console.log("[6J-login] password válida:", pwValida);


  if (tutor && tutor.activo && pwValida) {
    console.log("[6J-login] tutor válido → rol: tutor | id:", tutor.id);
    return {
      matricula: tutor.id,
      rol: "tutor",
      curp: tutor.curp ?? undefined,
      nombre: nombreCompletoTutor(tutor),
    };
  }

  console.log("[6J-login] ningún rol válido → null");
  return null;
}



