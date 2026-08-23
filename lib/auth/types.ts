export type PortalRole = "alumno" | "maestro" | "directivo" | "tutor";

export type PortalSessionPayload = {
  matricula: string;
  rol: PortalRole;
  curp?: string;
  nombre?: string;
};
