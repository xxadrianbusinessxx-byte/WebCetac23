// diag-eliminar-ciclo.mjs — DIAGNÓSTICO (SOLO LECTURA) — PROMPT-1/T4.
// Replica el conteo exacto de `lib/escolar/ciclo/eliminar-ciclo.ts`
// (diagnosticoEliminarCiclo) para uno o varios periodos, usando REST con
// service_role. NO borra nada; el borrado real es el RPC `eliminar_ciclo`
// (otro script), que vuelve a validar dentro de su transacción.
//
// Uso:
//   node scripts/diag-eliminar-ciclo.mjs 93b24c43 7f5bf67c
import fs from "node:fs";
import path from "node:path";

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Uso: node scripts/diag-eliminar-ciclo.mjs <id1> [id2...]");
  process.exit(1);
}

const root = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function contarEn(tabla, columna, valores) {
  if (valores.length === 0) return 0;
  const data = await get(tabla, "id", `&${columna}=in.(${valores.map((v) => encodeURIComponent(v)).join(",")})&limit=100000`);
  return data.length;
}

async function main() {
  // Verificar que el RPC y su tabla de auditoría existen (de lo contrario el
  // borrado fallaría; mejor saberlo antes).
  try {
    const spec = await (await fetch(`${urlBase}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json();
    const defs = spec.definitions ?? spec;
    console.log(`RPC eliminar_ciclo disponible: ${Boolean(spec.paths?.["/rpc/eliminar_ciclo"] ?? spec.definitions) ? "consultar abajo" : "?"}`);
    console.log(`Tabla ciclo_transiciones existe: ${Boolean(defs["ciclo_transiciones"])}`);
  } catch (e) {
    console.log(`(no se pudo inspeccionar el spec: ${e.message})`);
  }

  const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
  for (const t of targets) {
    const periodo = periodos.find((p) => String(p.id).startsWith(t.toLowerCase())) ?? periodos.find((p) => String(p.id) === t);
    if (!periodo) {
      console.log(`\n[${t}] periodo no encontrado.`);
      continue;
    }
    const id = periodo.id;
    const grupos = await get("grupos", "id", `&periodo_id=eq.${encodeURIComponent(id)}&limit=100000`);
    const grupoIds = grupos.map((g) => g.id);
    const [gm, insc, horario, parciales, calendario, semestres, clases, asistencia, justifs, transiciones] = await Promise.all([
      contarEn("grupo_materias", "grupo_id", grupoIds),
      contarEn("inscripciones_alumno", "grupo_id", grupoIds),
      contarEn("horario_semanal", "periodo_id", [id]),
      contarEn("periodos_evaluacion", "periodo_id", [id]),
      contarEn("calendario_escolar", "periodo_id", [id]),
      contarEn("academico_semestres", "periodo_id", [id]),
      contarEn("clases_impartidas", "periodo_id", [id]),
      contarEn("asistencia_alumnos", "periodo_id", [id]),
      contarEn("justificaciones_asistencia", "periodo_id", [id]),
      contarEn("ciclo_transiciones", "periodo_id", [id]).catch(() => -1),
    ]);
    const gmsDeGrupos = gm ? await get("grupo_materias", "id", `&grupo_id=in.(${grupoIds.map((x) => encodeURIComponent(x)).join(",")})&limit=100000`) : [];
    const asignaciones = await contarEn("asignaciones_profesor", "grupo_materia_id", gmsDeGrupos.map((g) => g.id));

    const estado = String(periodo.estado ?? "").toUpperCase();
    const operativo = estado === "OPERATIVO" || Boolean(periodo.activo);
    const bloqueos = [];
    if (operativo) bloqueos.push("Es el ciclo OPERATIVO actual (o activo=true): bloqueado.");
    if (insc > 0) bloqueos.push(`Tiene ${insc} inscripciones (activas o históricas): bloqueado.`);

    console.log(`\n=== CICLO ${periodo.nombre} [${String(id).slice(0, 8)}] ===`);
    console.log(`estado=${periodo.estado ?? "(sin columna)"}  activo=${periodo.activo}`);
    console.log(`  grupos=${grupos.length}  grupo_materias=${gm}  inscripciones=${insc}`);
    console.log(`  horario=${horario}  parciales=${parciales}  calendario=${calendario}  semestres=${semestres}`);
    console.log(`  asignaciones=${asignaciones}  clases_impartidas=${clases}  asistencia_alumnos=${asistencia}`);
    console.log(`  justificaciones=${justifs}  transiciones=${transiciones}`);
    console.log(`  BLOQUEOS: ${bloqueos.length ? bloqueos.join(" | ") : "NINGUNO (puede eliminarse)"}`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
