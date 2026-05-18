export type PortalRole = "alumno" | "maestro" | "directivo";

export type PortalSessionPayload = {
  matricula: string;
  rol: PortalRole;
  curp?: string;
  nombre?: string;
};
