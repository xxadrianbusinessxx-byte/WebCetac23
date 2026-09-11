import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AulaNube — Configuración",
  description: "La consola del técnico vive en el portal.",
};

/**
 * RUTA RETIRADA (Fase 9 del rediseño Océano) — redirige al portal.
 *
 * Era la última bloqueada, y lo que la desbloqueó fue extraer de
 * `configuracion-client.tsx` los dos bloques que vivían escritos en línea:
 * el roster (con su carga académica) y la importación de etiquetas. Hasta
 * entonces el shell no podía ofrecerlos porque no había componente que montar,
 * y retirar esta ruta habría borrado la única vía de importarlos.
 *
 * Cobertura comprobada panel a panel — los ocho que montaba esta ruta:
 *   RosterAlumnosPanel ............ Personas › Alumnos (modo Roster)
 *   ImportarEtiquetasPanel ........ Personas › Alumnos (modo Etiquetas)
 *   BajaRosterPanel ............... Personas › Alumnos (modo Baja)
 *   TutoresPanel .................. Personas › Tutores
 *   ProfesoresCredencialesPanel ... Personas › Profesores
 *   CicloConfigurador ............. Ciclo escolar › Configurador
 *   DeshacerPasoPanel ............. Ciclo escolar › Deshacer
 *   AsignacionesProfesorAdmin ..... Catálogo › Asignaciones
 *   MateriasConfigPanel ........... Catálogo › Materias
 *
 * `configuracion-client.tsx` NO se borra: redirigir es reversible, borrar no.
 * Queda como red hasta que el portal lleve tiempo en uso (R8).
 */
export default function ConfiguracionPage() {
  redirect("/oceano");
}
