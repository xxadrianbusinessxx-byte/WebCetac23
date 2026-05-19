export type AlumnoRow = {
  CURP: string;
  P_APELLIDO: string | null;
  S_APELLIDO: string | null;
  NOMBRE: string | null;
  CLAVE: string;
};

export type EtiquetasPersonalesRow = {
  CURP: string;
  GENERO: string | null;
  GRADO: string | null;
  GRUPO: string | null;
  CORREO: string | null;
  CELULAR: string | null;
  "TIPO DE SANGRE": string | null;
  ALERGIAS: string | null;
  LENTES: string | null;
  "ENFERMEDAD CRONICA": string | null;
  "SALUD MENTAL": string | null;
  "NECESIDAD PSICOLOGICA": string | null;
  PESO: string | null;
  TALLA: string | null;
  VACUNACION: string | null;
  CARRERA: string | null;
  EMPTY1: string | null;
  EMPTY2: string | null;
  EMPTY3: string | null;
  EMPTY4: string | null;
  EMPTY5: string | null;
  EMPTY6: string | null;
  "COMENTARIO PERSONAL": string | null;
};

export type ComentarioRow = {
  CURP: string;
  COMENTARIO: string;
  FECHA: string | null;
};

export type ComentarioProfesorRow = {
  "PROFESOR/DIRECTIVO": string | null;
  COMENTARIO: string;
  "NOMBRE/ALUMNO": string | null;
};

export type MateriaContenidoRow = {
  id: number;
  columna1: string | null;
  columna2: string | null;
  created_at?: string;
};

export type MateriaTablaVista = {
  encabezados: string[];
  filas: string[][];
};
