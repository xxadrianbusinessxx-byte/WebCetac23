"use server";

import { obtenerAlumnosEstrella } from "@/lib/escolar/alumno/alumnos-estrella";
import { createClient } from "@/lib/supabase/server";

export async function actionAlumnosEstrella() {
  const supabase = await createClient();
  return obtenerAlumnosEstrella(supabase, 4);
}
