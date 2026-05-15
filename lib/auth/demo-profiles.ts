import type { GeneroUsuario } from "@/lib/chat/types";
import type { PortalRole } from "./types";

export type DemoProfile = {
  matricula: string;
  nombre: string;
  genero: GeneroUsuario;
  rol: PortalRole;
};

const PERFILES: DemoProfile[] = [
  {
    matricula: "ALU001",
    nombre: "Alumno",
    genero: "masculino",
    rol: "alumno",
  },
  {
    matricula: "MAE001",
    nombre: "Profesor",
    genero: "masculino",
    rol: "maestro",
  },
  {
    matricula: "DIR001",
    nombre: "Directivo",
    genero: "femenino",
    rol: "directivo",
  },
];

export function demoProfilePorMatricula(
  matricula: string,
): DemoProfile | undefined {
  const key = matricula.trim().toUpperCase();
  return PERFILES.find((p) => p.matricula === key);
}

export function demoProfilePorOrigen(
  origen: "perfil" | "profesor" | "directivo",
): DemoProfile {
  if (origen === "profesor") {
    return PERFILES.find((p) => p.rol === "maestro") ?? PERFILES[0];
  }
  if (origen === "directivo") {
    return PERFILES.find((p) => p.rol === "directivo") ?? PERFILES[0];
  }
  return PERFILES.find((p) => p.rol === "alumno") ?? PERFILES[0];
}
