/**
 * F6 — VALIDACIÓN DE COHERENCIA ROSTER/HORARIO (dominio puro).
 *
 * Reglas estructurales:
 *   - cada bloque de `horario_semanal` pertenece a un (periodo_id, grupo_id)
 *     del MISMO periodo;
 *   - nunca: periodo A + grupo de B; grupo de A + materia vinculada a grupo de
 *     B (grupo_materias es la única relación materia→grupo);
 *   - profesor: si la clave es ambigua (varias filas con la misma CLAVE y
 *     distinto ID/identidad), no se elige arbitrariamente: se reporta.
 */
export type ProblemaRoster = { codigo: string; mensaje: string };

export type DatosHorarioValidar = {
  periodoId: string;
  grupos: Array<{ id: string; periodo_id: string }>;
  grupoMaterias: Array<{ grupo_id: string; materia_id: string; activo: boolean }>;
  materias: Array<{ id: string; activo: boolean }>;
};

/** Valida combinaciones periodo+grupo+materia de un conjunto de bloques. */
export function validarCoherenciaHorario(
  datos: DatosHorarioValidar,
  bloques: Array<{ periodo_id: string; grupo_id: string; materia_id?: string | null }>,
): ProblemaRoster[] {
  const errores: ProblemaRoster[] = [];
  const grupoIds = new Set(datos.grupos.filter((g) => g.periodo_id === datos.periodoId).map((g) => g.id));
  const materiasActivas = new Set(datos.materias.filter((m) => m.activo).map((m) => m.id));
  const materiasPorGrupo = new Map<string, Set<string>>();
  for (const gm of datos.grupoMaterias) {
    if (!gm.activo) continue;
    if (!materiasPorGrupo.has(gm.grupo_id)) materiasPorGrupo.set(gm.grupo_id, new Set());
    materiasPorGrupo.get(gm.grupo_id)!.add(gm.materia_id);
  }
  for (const b of bloques) {
    if (b.periodo_id !== datos.periodoId) {
      errores.push({ codigo: "bloque_periodo_incorrecto", mensaje: `Bloque con periodo ${b.periodo_id} no pertenece al periodo ${datos.periodoId}.` });
      continue;
    }
    if (!grupoIds.has(b.grupo_id)) {
      errores.push({ codigo: "grupo_de_otro_periodo", mensaje: `El grupo ${b.grupo_id} no pertenece al periodo ${datos.periodoId}.` });
    }
    if (b.materia_id && !materiasActivas.has(b.materia_id)) {
      errores.push({ codigo: "materia_inactiva", mensaje: `La materia ${b.materia_id} no existe o está inactiva.` });
    }
    if (b.materia_id) {
      const permitidas = materiasPorGrupo.get(b.grupo_id) ?? new Set<string>();
      if (!permitidas.has(b.materia_id)) {
        errores.push({
          codigo: "materia_no_pertenece_grupo",
          mensaje: `La materia ${b.materia_id} no está vinculada al grupo ${b.grupo_id} (grupo_materias).`,
        });
      }
    }
  }
  return errores;
}

/** Profesores con CLAVE duplicada (no se elige uno arbitrariamente). */
export function profesoresClaveAmbiguos(
  profesores: Array<{ id: string | number; clave: string; nombre: string }>,
): Array<{ clave: string; filas: Array<{ id: string | number; nombre: string }> }> {
  const porClave = new Map<string, Array<{ id: string | number; nombre: string }>>();
  for (const p of profesores) {
    const c = (p.clave ?? "").trim().toUpperCase();
    if (!c) continue;
    const lista = porClave.get(c) ?? [];
    lista.push({ id: p.id, nombre: p.nombre });
    porClave.set(c, lista);
  }
  return [...porClave.entries()]
    .filter(([, filas]) => new Set(filas.map((f) => String(f.id))).size > 1)
    .map(([clave, filas]) => ({ clave, filas }));
}
