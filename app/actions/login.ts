"use server";

import { redirect } from "next/navigation";
import { validarAccesoPortal } from "@/lib/auth/portal-login";
import { setPortalSessionCookie } from "@/lib/auth/session";
import type { PortalRole } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

export type LoginFormState = {
  error?: string;
};

function destinationForRole(rol: PortalRole): string {
  switch (rol) {
    case "alumno":
      return "/perfil";
    case "maestro":
      return "/profesor";
    case "directivo":
      return "/directivo";
    case "tutor":
      return "/tutor";
    default:
      return "/";
  }
}

export async function loginWithNombreCompleto(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const identificador = String(formData.get("identificador") ?? "").trim();
  const clave = String(formData.get("clave") ?? "");

  // [DIAGNÓSTICO TEMPORAL 6J] Log seguro: identificador y longitud de clave,
  // NUNCA la clave/contraseña ni hashes. Se eliminará al terminar el diagnóstico.
  console.log("[6J-login] action ejecutada");
  console.log("[6J-login] identificador recibido:", JSON.stringify(identificador));
  console.log("[6J-login] longitud de clave:", clave.length);

  if (!identificador || !clave) {
    console.log("[6J-login] identificador o clave vacíos → error");
    return { error: "Indica identificador y clave." };
  }

  const supabase = await createClient();
  const user = await validarAccesoPortal(supabase, identificador, clave);
  if (!user) {
    console.log("[6J-login] validarAccesoPortal → null → 'Identificador o clave incorrectos.'");
    return { error: "Identificador o clave incorrectos." };
  }

  console.log("[6J-login] usuario válido → rol:", user.rol, "| matricula:", user.matricula);

  await setPortalSessionCookie({
    matricula: user.matricula,
    rol: user.rol,
    curp: user.curp,
    nombre: user.nombre,
    profesorId: user.profesorId,
    debeCambiarCredenciales: user.debeCambiarCredenciales,
  });
  console.log("[6J-login] sesión creada → redirect:", destinationForRole(user.rol));
  redirect(destinationForRole(user.rol));
}


