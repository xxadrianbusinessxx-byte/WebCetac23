"use server";

/**
 * roster.ts — Server Actions del ROSTER de alumnos que no son la carga en sí.
 * 2026-10-25.
 *
 * Por qué un archivo propio y no `escolar.ts`: aquel ya roza las 1 000 líneas
 * que vigila C9 de `test-orden`, y el roster es un dominio con nombre propio
 * (`alumno.cargar_roster`, `roster-borrado.ts`, `roster-alumnos-panel.tsx`).
 * Las actions de carga y previsualización siguen donde estaban: mover lo que
 * ya funciona no entra en este cambio (R8).
 */
import { exigir } from "@/lib/auth/exigir";
import { generarPlantillaRoster } from "@/lib/escolar/alumno/plantilla-roster";
import { createClient } from "@/lib/supabase/server";

/**
 * Baja el roster ACTUAL del ciclo como hoja rellenable.
 *
 * Los encabezados son los mismos alias que reconoce la carga, así que bajarla,
 * rellenar lo que falte —hoy, el número de control de 356 de los 357 alumnos
 * del ciclo— y volver a subirla por «Roster» no obliga a mapear ninguna
 * columna a mano. Que eso siga siendo verdad lo comprueba
 * `scripts/test-plantilla-roster.mjs`.
 */
export async function actionDescargarPlantillaRoster(): Promise<
  | {
      ok: true;
      base64: string;
      nombreArchivo: string;
      alumnos: number;
      sinNumeroControl: number;
      ciclo: string | null;
    }
  | { ok: false; error: string }
> {
  const g = await exigir("alumno.cargar_roster");
  if (!g.ok) return { ok: false, error: "No autorizado para descargar el roster." };
  try {
    const supabase = await createClient();
    return await generarPlantillaRoster(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return { ok: false, error: `No se pudo generar la plantilla: ${msg}` };
  }
}
