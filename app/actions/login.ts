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
    default:
      return "/";
  }
}

export async function loginWithNombreCompleto(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const nombreCompleto = String(formData.get("nombreCompleto") ?? "").trim();
  const clave = String(formData.get("clave") ?? "");

  if (!nombreCompleto || !clave) {
    return { error: "Indica nombre completo y clave." };
  }

  const supabase = await createClient();
  const user = await validarAccesoPortal(supabase, nombreCompleto, clave);
  if (!user) {
    return { error: "Nombre completo o clave incorrectos." };
  }

  await setPortalSessionCookie({
    matricula: user.matricula,
    rol: user.rol,
    curp: user.curp,
    nombre: user.nombre,
  });
  redirect(destinationForRole(user.rol));
}
