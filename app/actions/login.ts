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
    case "tecnico":
      // PROMPT-3: la consola del técnico vive en /configuracion (T2/T3), la
      // ruta de quien tenga las capacidades de configuración.
      return "/configuracion";
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

  if (!identificador || !clave) {
    return { error: "Indica identificador y clave." };
  }

  const supabase = await createClient();
  const user = await validarAccesoPortal(supabase, identificador, clave);
  if (!user) {
    return { error: "Identificador o clave incorrectos." };
  }

  await setPortalSessionCookie({
    matricula: user.matricula,
    rol: user.rol,
    curp: user.curp,
    nombre: user.nombre,
    profesorId: user.profesorId,
    debeCambiarCredenciales: user.debeCambiarCredenciales,
  });
  redirect(destinationForRole(user.rol));
}


