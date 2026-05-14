"use server";

import { redirect } from "next/navigation";
import { validatePortalCredentials } from "@/lib/auth/demo-users";
import { setPortalSessionCookie } from "@/lib/auth/session";
import type { PortalRole } from "@/lib/auth/types";

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

export async function loginWithMatricula(
  _prev: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const matricula = String(formData.get("matricula") ?? "").trim();
  const clave = String(formData.get("clave") ?? "");

  if (!matricula || !clave) {
    return { error: "Indica matrícula y clave única." };
  }

  const user = validatePortalCredentials(matricula, clave);
  if (!user) {
    return { error: "Matrícula o clave incorrectos." };
  }

  await setPortalSessionCookie({ matricula: user.matricula, rol: user.rol });
  redirect(destinationForRole(user.rol));
}
