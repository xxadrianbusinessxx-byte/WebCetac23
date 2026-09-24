import type { SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import {
  buscarAlumnoPorNombre,
  nombreCompletoAlumno,
} from "@/lib/escolar/alumno/alumnos";
import {
  buscarProfesorPorNombre,
  nombreProfesor,
  rolDesdePermisos,
} from "@/lib/escolar/catalogo/profesores";
import {
  buscarTutorPorClaveTutor,
  buscarTutorPorUsuario,
  nombreCompletoTutor,
  verificarContraseñaInicialMultiHijo,
  verificarContraseñaTutor,
} from "@/lib/escolar/tutores/tutores";

import type { PortalRole } from "./types.ts";

export type LoginResult = {
  matricula: string;
  rol: PortalRole;
  curp?: string;
  nombre?: string;
  /** C4.10 — Identidad estructural (PROFESORES.ID). Solo profesor/directivo. */
  profesorId?: number;
  /** BLOQUE 9 (PIEZA 5) — true = el profesor/directivo debe cambiar su clave
   *  antes de usar el portal (flag debe_cambiar_credenciales). */
  debeCambiarCredenciales?: boolean;
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

  const profesor = await buscarProfesorPorNombre(supabase, identificador);
  if (profesor && clavesCoinciden(clave, profesor.CLAVE)) {
    const nombre = nombreProfesor(profesor);
    return {
      matricula: profesor.CLAVE,
      rol: rolDesdePermisos(profesor.Permisos),
      nombre,
      profesorId: profesor.ID,
      // BLOQUE 9 (PIEZA 5) — el login NO cambia la lógica de comparación de
      // clave; solo lee el flag para que la UI fuerce el cambio de clave.
      debeCambiarCredenciales: Boolean(profesor.debe_cambiar_credenciales),
    };
  }

  const alumno = await buscarAlumnoPorNombre(supabase, identificador);
  if (alumno && clavesCoinciden(clave, alumno.CLAVE)) {
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
  const tutorPorUsuario = await buscarTutorPorUsuario(supabase, identificador);
  const tutorPorClave = tutorPorUsuario ? null : await buscarTutorPorClaveTutor(supabase, identificador);
  const tutor = tutorPorUsuario ?? tutorPorClave;

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

  if (tutor && tutor.activo && pwValida) {
    return {
      matricula: tutor.id,
      rol: "tutor",
      curp: tutor.curp ?? undefined,
      nombre: nombreCompletoTutor(tutor),
    };
  }

  return null;
}



