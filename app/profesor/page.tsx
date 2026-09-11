import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AulaNube — Profesor",
  description: "El panel del profesor vive en el portal.",
};

/**
 * RUTA RETIRADA (Fase 9 del rediseño Océano) — redirige al portal.
 *
 * Cobertura comprobada componente a componente: `profesor-client.tsx` montaba
 * MateriaSelector, MateriaTablaVistaPanel, MateriaMapeoColumnas,
 * AsistenciasPanel y BuscadorAlumnoProfesor. Los cinco están montados en el
 * shell por `contenido-docente.ts`, con las mismas props y las mismas actions.
 *
 * El portal además estrecha solo por R-4: el día que `asignaciones_profesor`
 * se pueble, el catálogo se reduce sin tocar interfaz.
 *
 * `profesor-client.tsx` NO se borra: redirigir es reversible, borrar no (R8).
 */
export default function ProfesorPage() {
  redirect("/oceano");
}
