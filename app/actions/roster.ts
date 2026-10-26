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
import { generarHojaAlumnado } from "@/lib/escolar/alumno/etiquetas-exportar";
import type { HojaAlumnado } from "@/lib/escolar/alumno/etiquetas-exportar-puro";
import { generarPlantillaRoster } from "@/lib/escolar/alumno/plantilla-roster";
import { leerRosterDelCiclo } from "@/lib/escolar/alumno/roster-ciclo";
import { agruparRoster, resumenRoster, type GrupoDelCiclo } from "@/lib/escolar/alumno/roster-ciclo-puro";
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
  // `alumno.ver_roster` y no `alumno.cargar_roster` (2026-10-25): bajar el
  // padrón es lectura, y el rol Servicio Escolar tiene que poder hacerlo sin
  // heredar la capacidad que SINCRONIZA el padrón. El técnico tiene las dos,
  // así que para él no cambia nada.
  const g = await exigir("alumno.ver_roster");
  if (!g.ok) return { ok: false, error: "No autorizado para descargar el roster." };
  try {
    const supabase = await createClient();
    return await generarPlantillaRoster(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return { ok: false, error: `No se pudo generar la plantilla: ${msg}` };
  }
}

/**
 * El padrón del ciclo agrupado por grado, grupo y carrera (2026-10-25).
 *
 * Lo pinta el rol Servicio Escolar. Los tres campos juntos son la clave real:
 * «3RO A» existe en MECATRÓNICA y en RH, así que agrupar solo por grupo
 * mezclaría dos listas distintas (`roster-ciclo-puro.ts`).
 */
export async function actionPadronDelCiclo(): Promise<
  | { ok: true; ciclo: string | null; grupos: GrupoDelCiclo[]; resumen: ReturnType<typeof resumenRoster> }
  | { ok: false; error: string }
> {
  const g = await exigir("alumno.ver_roster");
  if (!g.ok) return { ok: false, error: "No autorizado para ver el padrón." };
  try {
    const supabase = await createClient();
    const roster = await leerRosterDelCiclo(supabase);
    if (!roster.ok) return { ok: false, error: roster.error };
    const grupos = agruparRoster(roster.filas);
    return { ok: true, ciclo: roster.ciclo, grupos, resumen: resumenRoster(grupos) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return { ok: false, error: `No se pudo leer el padrón: ${msg}` };
  }
}

/**
 * Baja a `.xlsx` lo guardado en `ETIQUETAS PERSONALES` para los alumnos del
 * ciclo: «etiquetas» (contacto) o «medica» (situación médica).
 *
 * Recorre el padrón, no la tabla: quien no tenga ficha sale igual, con las
 * celdas vacías. Ver quién falta es justo para lo que sirve esta descarga.
 */
export async function actionDescargarHojaAlumnado(
  hoja: HojaAlumnado,
): Promise<
  | { ok: true; base64: string; nombreArchivo: string; alumnos: number; sinFicha: number; ciclo: string | null }
  | { ok: false; error: string }
> {
  const g = await exigir("alumno.descargar_etiquetas");
  if (!g.ok) return { ok: false, error: "No autorizado para descargar estos archivos." };
  if (hoja !== "etiquetas" && hoja !== "medica") {
    return { ok: false, error: "Hoja desconocida." };
  }
  try {
    const supabase = await createClient();
    const r = await generarHojaAlumnado(supabase, hoja);
    if (!r.ok) return r;
    const { hoja: _hoja, ...resto } = r;
    return resto;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return { ok: false, error: `No se pudo generar la hoja: ${msg}` };
  }
}
