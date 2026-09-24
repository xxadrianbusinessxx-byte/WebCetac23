"use server";

import { redirect } from "next/navigation";
import { validarAccesoPortal } from "@/lib/auth/portal-login";
import { limpiarPortalSessionCookie, setPortalSessionCookie } from "@/lib/auth/session";
import type { PortalRole } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { leerFormData } from "@/lib/validacion/leer-form-data";
import { esquemaLogin } from "@/lib/validacion/esquemas-puro";

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
    case "administracion":
      // 2026-09-24: rol nuevo, sin ruta heredada que redirija. Entra directo al
      // shell, que es donde vive todo lo suyo.
      return "/oceano";
    default:
      return "/";
  }
}

export async function loginWithNombreCompleto(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  // La puerta de entrada: aquí no hay `exigir()` que valga —todavía no hay sesión— así
  // que la entrada se valida contra un esquema declarado antes de tocar Supabase. El
  // mensaje y el recorte de `identificador` son los mismos de antes.
  const entrada = leerFormData(esquemaLogin, formData);
  if (!entrada.ok) return { error: entrada.error };
  const { identificador, clave } = entrada.datos;

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

/**
 * Cierra la sesión del portal y devuelve al acceso.
 *
 * Vive junto al login porque es su inverso: los dos escriben la MISMA cookie
 * y ninguno de los dos toca Supabase. Toda la sesión está en esa cookie
 * firmada, así que borrarla basta; no hay estado en servidor que invalidar.
 *
 * NO llama a `exigir()`, y es deliberado: `exigir` responde «¿puede este rol
 * ejecutar tal capacidad?», y cerrar la propia sesión no es una capacidad que
 * un rol pueda tener o no. Exigir algo aquí tendría además un efecto absurdo —
 * una sesión rota o sin rol válido no podría salir de sí misma. La acción no
 * lee ni escribe datos de nadie: solo retira la credencial de quien la envía.
 * La auditoría de permisos la declara como excepción por este motivo.
 *
 * `redirect` a `/login` y no a `/`: lo que se pidió es poder volver a entrar.
 */
export async function actionCerrarSesion(): Promise<void> {
  await limpiarPortalSessionCookie();
  redirect("/login");
}


