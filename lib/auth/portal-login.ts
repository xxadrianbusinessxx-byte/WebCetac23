import type { SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { nombreCompletoAlumno } from "../escolar/alumno/alumnos.ts";
import { nombreProfesor, rolDesdePermisos } from "../escolar/catalogo/profesores.ts";
import { nombreCompletoTutor } from "../escolar/tutores/tutores-types.ts";
import { verificarContraseñaTutor } from "../escolar/tutores/tutores-credenciales.ts";

import { fuenteLogin, type FuenteLogin } from "./fuente-login.ts";
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
  /** PROMPT Z-bis — de dónde salen los candidatos (`fuente-login.ts`); por
   *  defecto, la RPC `candidatos_login` en UNA petición o, sin ella, las
   *  consultas de siempre. La decisión de abajo es la misma con las dos. */
  fuenteDada?: FuenteLogin,
): Promise<LoginResult | null> {
  const identificador = identificadorRaw.trim();
  if (!identificador || !clave) return null;
  const fuente = fuenteDada ?? (await fuenteLogin(supabase, identificador));

  const profesor = await fuente.profesor(identificador);
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

  const alumno = await fuente.alumno(identificador);
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
  const tutorPorUsuario = await fuente.tutorPorUsuario(identificador);
  const tutorPorClave = tutorPorUsuario ? null : await fuente.tutorPorClave(identificador);
  const tutor = tutorPorUsuario ?? tutorPorClave;

  // Bloque 6L: verificación de contraseña del tutor.
  //  - Si `debe_cambiar_credenciales` es true (aún no cambió su contraseña),
  //    se acepta la contraseña inicial derivada del CURP de CUALQUIERA de sus
  //    hijos (multi-hijo) O la del alumno de referencia (hash en `tutores`).
  //  - Si `debe_cambiar_credenciales` es false (ya cambió su contraseña), solo
  //    se acepta la contraseña personalizada almacenada en `tutores`.
  let pwValida = false;
  if (tutor) {
    pwValida = await verificarContraseñaTutor(clave, tutor.password_hash);
    if (!pwValida && tutor.debe_cambiar_credenciales) {
      pwValida = await fuente.coincideInicial(tutor.id, clave);
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



