import type { Metadata } from "next";
import { ProfesorClient } from "./profesor-client";

export const metadata: Metadata = {
  title: "AulaNube — Profesor",
  description:
    "Panel del profesor: materias, carga de calificaciones y comentarios a alumnos.",
};

export default function ProfesorPage() {
  return <ProfesorClient />;
}
