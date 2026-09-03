import type { SupabaseClient } from "@supabase/supabase-js";
import { clonarContextoAcademico } from "./contexto-ciclo";
import {
  crearCicloBorrador,
  estadoActualCiclo,
  validarIntegridadCiclo,
  type ConteosCiclo,
} from "./ciclo-estado";
import type { AsuntoIntegridad, ResultadoIntegridad } from "./ciclo-estado-puro";

/**
 * F4 — ORQUESTACIÓN DEL CICLO.
 *
 * `crearCicloConContexto`: crea un BORRADOR y, opcionalmente, clona el contexto
 * académico (grupos + materias por `materia_id`) desde un ciclo origen.
 * Nunca activa. Devuelve el resumen de integridad para que el directivo decida
 * continuar (F2/F3) y, al final, activar mediante `activarCicloOperativo`.
 */
export type PlanCrearCiclo = {
  ok: boolean;
  error?: string;
  periodoId?: string;
  nombre?: string;
  activo?: boolean;
  estado?: string;
  clonado?: { gruposCreados?: number; materiasVinculadas?: number } | null;
  validacion?: ResultadoIntegridad;
  conteos?: ConteosCiclo;
};

export async function crearCicloConContexto(
  supabase: SupabaseClient,
  input: {
    nombre: string;
    fechaInicio?: string | null;
    fechaFin?: string | null;
    origenId?: string | null;
    copiarGruposMaterias?: boolean;
  },
): Promise<PlanCrearCiclo> {
  const creado = await crearCicloBorrador(supabase, {
    nombre: input.nombre,
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin,
  });
  if (!creado.ok) {
    return { ok: false, error: ("error" in creado && creado.error) || "No se pudo crear el ciclo." };
  }
  const periodoId = creado.periodoId;
  if (!periodoId) return { ok: false, error: "El ciclo se creó sin identificador." };

  let clonado: PlanCrearCiclo["clonado"] = null;
  if (input.origenId && input.copiarGruposMaterias) {
    const clon = await clonarContextoAcademico(supabase, {
      periodoOrigenId: input.origenId,
      periodoDestinoId: periodoId,
    });
    if (clon.ok) {
      clonado = { gruposCreados: clon.gruposCreados, materiasVinculadas: clon.materiasVinculadas };
    } else {
      const detalleClon = "error" in clon ? clon.error : "desconocido";
      return {
        ok: false,
        error: `Ciclo creado en BORRADOR (${periodoId}) pero el clonado de contexto falló: ${detalleClon}.`,
        periodoId,
      };
    }
  }

  const val = await validarIntegridadCiclo(supabase, periodoId);
  return {
    ok: true,
    periodoId,
    nombre: creado.mensaje ? undefined : input.nombre,
    activo: false,
    estado: "borrador",
    clonado,
    validacion: { ok: val.ok, errores: val.errores, advertencias: val.advertencias },
    conteos: val.conteos,
  };
}

export type EntradaAuditoriaCiclo = {
  periodoId: string;
  operacion: string;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
  actor?: string | null;
  resultado: string;
  detalle?: string | null;
};

/**
 * F4.5 — Auditoría mínima de transiciones. Escribe en `ciclo_transiciones`
 * solo si la tabla existe (migración opcional aplicada); nunca falla por su
 * ausencia y nunca es bloqueante.
 */
export async function registrarTransicionCiclo(
  supabase: SupabaseClient,
  entrada: EntradaAuditoriaCiclo,
): Promise<void> {
  try {
    const probe = await supabase.from("ciclo_transiciones").select("id").limit(1);
    if (probe.error) return;
    await supabase.from("ciclo_transiciones").insert({
      periodo_id: entrada.periodoId,
      operacion: entrada.operacion,
      estado_anterior: entrada.estadoAnterior,
      estado_nuevo: entrada.estadoNuevo,
      actor: entrada.actor ?? null,
      resultado: entrada.resultado,
      detalle: entrada.detalle ?? null,
    });
  } catch {
    // Auditoría no bloqueante.
  }
}

export type { EstadoCiclo } from "./ciclo-estado-puro";

/** Utilidad para Server Actions: estado actual simple. */
export async function estadoCicloParaAction(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<{ ok: boolean; error?: string; estado?: string; activo?: boolean }> {
  const r = await estadoActualCiclo(supabase, periodoId);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, estado: r.estado, activo: r.activo };
}

export type { AsuntoIntegridad };
