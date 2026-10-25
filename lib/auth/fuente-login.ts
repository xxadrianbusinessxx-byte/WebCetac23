/**
 * fuente-login.ts — PROMPT Z-bis. De DÓNDE salen los candidatos del login.
 *
 * `validarAccesoPortal` decide quién entra siempre con el mismo código (nombres
 * normalizados, clave, scrypt). Lo que cambia aquí es solo la fuente:
 *   · RPC `candidatos_login` (supabase/crear-rpc-candidatos-login.sql): UNA
 *     petición trae profesores, alumnos candidatos (filtro superconjunto de
 *     `patronFiltroNombre`), el tutor por usuario o por clave y sus hashes de
 *     contraseña inicial. Antes eran hasta 5 peticiones en serie, y en una ráfaga
 *     de 500 personas entrando en 10 s era el paso donde se caía todo.
 *   · Consultas directas, como siempre: si la RPC no existe (SQL sin aplicar),
 *     falla o no hay `service_role`.
 *
 * Si la RPC no existe, se recuerda 60 s por instancia para no pagar en cada login
 * un viaje que va a fallar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buscarAlumnoPorNombre, elegirAlumnoPorNombre } from "../escolar/alumno/alumnos.ts";
import {
  buscarProfesorPorNombre,
  elegirProfesorPorNombre,
  type ProfesorRow,
} from "../escolar/catalogo/profesores.ts";
import { patronFiltroNombre } from "../escolar/nombres.ts";
import {
  buscarTutorPorClaveTutor,
  buscarTutorPorUsuario,
  verificarContraseñaEntreHashes,
  verificarContraseñaInicialMultiHijo,
} from "../escolar/tutores/tutores-credenciales.ts";
import type { TutorRow } from "../escolar/tutores/tutores-types.ts";
import type { AlumnoRow } from "../escolar/types.ts";
import { createServiceClient } from "../supabase/service.ts";

export type FuenteLogin = {
  profesor(identificador: string): Promise<ProfesorRow | null>;
  alumno(identificador: string): Promise<AlumnoRow | null>;
  tutorPorUsuario(identificador: string): Promise<TutorRow | null>;
  tutorPorClave(identificador: string): Promise<TutorRow | null>;
  /** ¿La clave coincide con alguna contraseña inicial (multi-hijo) del tutor? */
  coincideInicial(tutorId: string, clave: string): Promise<boolean>;
  /** Para la medición y las pruebas: de dónde salieron los candidatos. */
  readonly via: "rpc" | "consultas";
};

/** Las consultas de siempre, una por pregunta. */
export function fuenteConsultas(supabase: SupabaseClient): FuenteLogin {
  return {
    via: "consultas",
    profesor: (id) => buscarProfesorPorNombre(supabase, id),
    alumno: (id) => buscarAlumnoPorNombre(supabase, id),
    tutorPorUsuario: (id) => buscarTutorPorUsuario(supabase, id),
    tutorPorClave: (id) => buscarTutorPorClaveTutor(supabase, id),
    coincideInicial: (tutorId, clave) => verificarContraseñaInicialMultiHijo(supabase, tutorId, clave),
  };
}

type CandidatosLogin = {
  candidatos_v?: number;
  profesores?: ProfesorRow[];
  alumnos?: AlumnoRow[];
  tutor_usuario?: TutorRow | null;
  tutor_clave?: TutorRow | null;
  hashes_iniciales?: (string | null)[];
};

/** Fuente en memoria a partir de la respuesta de `candidatos_login`. */
export function fuenteDesdeCandidatos(c: CandidatosLogin, respaldo: FuenteLogin): FuenteLogin {
  const tutorElegido = c.tutor_usuario ?? c.tutor_clave ?? null;
  return {
    via: "rpc",
    profesor: async (id) => elegirProfesorPorNombre(c.profesores ?? [], id),
    alumno: async (id) => elegirAlumnoPorNombre(c.alumnos ?? [], id),
    tutorPorUsuario: async () => c.tutor_usuario ?? null,
    tutorPorClave: async () => c.tutor_clave ?? null,
    // Los hashes que trajo la RPC son los del tutor que ella eligió, que es el
    // mismo que elige `validarAccesoPortal` (usuario y, si no, clave). Si por lo
    // que sea se pregunta por otro, se consulta como siempre.
    coincideInicial: (tutorId, clave) =>
      tutorElegido && tutorElegido.id === tutorId
        ? verificarContraseñaEntreHashes(clave, c.hashes_iniciales ?? [])
        : respaldo.coincideInicial(tutorId, clave),
  };
}

const RECORDAR_SIN_RPC_MS = 60_000;
let rpcAusenteHasta = 0;

/** La fuente para este intento de login: la RPC si está, si no las consultas. */
export async function fuenteLogin(supabase: SupabaseClient, identificador: string): Promise<FuenteLogin> {
  const respaldo = fuenteConsultas(supabase);
  if (Date.now() < rpcAusenteHasta) return respaldo;
  const servicio = createServiceClient();
  if (!servicio) return respaldo;
  try {
    const { data, error } = await servicio.rpc("candidatos_login", {
      p_identificador: identificador,
      p_patron: patronFiltroNombre(identificador),
    });
    if (error) {
      if (/PGRST202|Could not find the function|does not exist/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
        rpcAusenteHasta = Date.now() + RECORDAR_SIN_RPC_MS;
      }
      return respaldo;
    }
    const c = data as CandidatosLogin | null;
    if (!c || typeof c.candidatos_v !== "number") return respaldo;
    return fuenteDesdeCandidatos(c, respaldo);
  } catch {
    return respaldo;
  }
}
