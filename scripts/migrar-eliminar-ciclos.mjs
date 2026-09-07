// migrar-eliminar-ciclos.mjs — PROMPT-1/T4 (ESCRIBE con --apply).
// Autorización humana concedida el 2026-09-06: se eliminan las 453+37
// inscripciones HISTÓRICAS inactivas de los ciclos 2026-2027 y BORRADOR (son
// duplicados del P0; todos sus CURPs ya están activos en el operativo) y luego
// se ejecuta la RPC transaccional `eliminar_ciclo` sobre ambos ciclos.
//
// Orden (todo con --apply):
//   1) Captura las 6 cifras del operativo (grupos, gm activas, inscripciones
//      activas, bloques horario, días de calendario, asignaciones activas).
//   2) DELETE de inscripciones_alumno cuyos grupo_id cuelgan de los dos ciclos
//      (solo filas inactivas; se aborta si aparece alguna ACTIVA).
//   3) RPC eliminar_ciclo sobre 2026-2027 y BORRADOR (una transacción cada una).
//   4) Re-captura las 6 cifras del operativo y demuestra que no cambiaron.
//   5) Renombra AGO2026-ENE2027 -> "2026-2027" (nombre nunca es identificador,
//      R5). Verifica antes que ninguna otra fila de periodos use ese nombre.
//
// Uso:
//   node scripts/migrar-eliminar-ciclos.mjs            # dry-run (plan)
//   node scripts/migrar-eliminar-ciclos.mjs --apply    # ejecuta
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const CICLOS_A_BORRAR = [
  { id: "93b24c43", nombre: "2026-2027" },
  { id: "7f5bf67c", nombre: "BORRADOR" },
];
const NOMBRE_NUEVO_OPERATIVO = "2026-2027";

const ROOT = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
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
const H = { apikey: key, Authorization: `Bearer ${key}` };

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function eliminarFilas(tabla, ids) {
  for (let i = 0; i < ids.length; i += 900) {
    const lote = ids.slice(i, i + 900);
    const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?id=in.(${lote.join(",")})`, {
      method: "DELETE",
      headers: H,
    });
    if (!r.ok) {
      const d = await r.json();
      throw new Error(`DELETE ${tabla} -> ${r.status} ${JSON.stringify(d).slice(0, 300)}`);
    }
  }
}

async function rpcEliminarCiclo(periodoId) {
  const r = await fetch(`${urlBase}/rest/v1/rpc/eliminar_ciclo`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ p_periodo: periodoId }),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = String(data?.message ?? JSON.stringify(data).slice(0, 300)).replace(/^eliminar_ciclo:\s*/i, "");
    throw new Error(`eliminar_ciclo(${periodoId}) -> ${r.status}: ${msg}`);
  }
  return data;
}

async function capturarOperativo(opId) {
  const grupos = await get("grupos", "id", `&periodo_id=eq.${encodeURIComponent(opId)}&limit=100000`);
  const ids = grupos.map((g) => g.id);
  const [gm, ins, horario, cal] = await Promise.all([
    ids.length ? get("grupo_materias", "id", `&grupo_id=in.(${ids.join(",")})&activo=eq.true&limit=100000`) : [],
    ids.length ? get("inscripciones_alumno", "id", `&grupo_id=in.(${ids.join(",")})&activo=eq.true&limit=100000`) : [],
    get("horario_semanal", "id", `&periodo_id=eq.${encodeURIComponent(opId)}&limit=100000`),
    get("calendario_escolar", "id", `&periodo_id=eq.${encodeURIComponent(opId)}&limit=100000`),
  ]);
  const gmsTodos = ids.length ? await get("grupo_materias", "id", `&grupo_id=in.(${ids.join(",")})&limit=100000`) : [];
  const asigs = gmsTodos.length
    ? await get("asignaciones_profesor", "id", `&grupo_materia_id=in.(${gmsTodos.map((g) => g.id).join(",")})&activo=eq.true&limit=100000`).catch(() => [])
    : [];
  return {
    grupos: ids.length,
    materiasActivas: gm.length,
    inscripcionesActivas: ins.length,
    bloquesHorario: horario.length,
    diasCalendario: cal.length,
    asignacionesActivas: asigs.length,
  };
}

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
  const operativo = periodos.find((p) => String(p.estado ?? "").toUpperCase() === "OPERATIVO") || periodos.find((p) => p.activo);
  if (!operativo) throw new Error("No hay periodo operativo.");
  if (operativo.nombre !== "AGO2026-ENE2027") {
    throw new Error(`El operativo se llama "${operativo.nombre}"; se esperaba AGO2026-ENE2027 para el renombrado.`);
  }

  // Resolver ids completos de los ciclos a borrar.
  const ciclos = CICLOS_A_BORRAR.map((c) => {
    const p = periodos.find((x) => String(x.id).startsWith(c.id));
    return { ...c, id: p ? p.id : c.id, existe: Boolean(p) };
  });
  for (const c of ciclos) {
    if (!c.existe) throw new Error(`Ciclo ${c.nombre} (${c.id}) no existe en periodos.`);
  }

  // Filas de inscripción de los grupos de esos ciclos.
  const porCiclo = [];
  for (const c of ciclos) {
    const grupos = await get("grupos", "id", `&periodo_id=eq.${encodeURIComponent(c.id)}&limit=100000`);
    const ids = grupos.map((g) => g.id);
    const filas = ids.length ? await get("inscripciones_alumno", "id,curp,activo", `&grupo_id=in.(${ids.join(",")})&limit=20000`) : [];
    const activas = filas.filter((f) => f.activo);
    porCiclo.push({ ...c, grupos: ids.length, filas: filas.length, activas: activas.length });
    if (activas.length > 0) {
      throw new Error(`Ciclo ${c.nombre} tiene ${activas.length} inscripciones ACTIVAS: no se autoriza borrarlas (solo históricas inactivas).`);
    }
  }

  console.log(`Periodo operativo: [${String(operativo.id).slice(0, 8)}] ${operativo.nombre}`);
  console.log(`Modo: ${APPLY ? "--apply (ESCRIBE)" : "DRY-RUN (no escribe nada)"}\n`);
  for (const c of porCiclo) {
    console.log(`Ciclo a borrar: ${c.nombre} [${String(c.id).slice(0, 8)}] — grupos=${c.grupos} · inscripciones históricas inactivas a eliminar=${c.filas}`);
  }

  const antes = await capturarOperativo(operativo.id);
  console.log(`\n=== OPERATIVO ANTES (seis cifras) ===`);
  console.log(`  grupos=${antes.grupos} · materias activas=${antes.materiasActivas} · inscripciones activas=${antes.inscripcionesActivas} · bloques horario=${antes.bloquesHorario} · días calendario=${antes.diasCalendario} · asignaciones activas=${antes.asignacionesActivas}`);

  const idsABorrar = new Set(ciclos.map((c) => c.id));
  const colisionRenombre = periodos.some(
    (p) => p.nombre === NOMBRE_NUEVO_OPERATIVO && p.id !== operativo.id && !idsABorrar.has(p.id),
  );
  if (colisionRenombre) {
    throw new Error(`Ya existe otro periodo llamado "${NOMBRE_NUEVO_OPERATIVO}" (distinto del que se va a borrar); no se puede renombrar.`);
  }
  console.log(`\nRenombrado final: AGO2026-ENE2027 -> ${NOMBRE_NUEVO_OPERATIVO} (tras borrar 2026-2027)`);

  if (!APPLY) {
    console.log("\nDRY-RUN terminado. Revisa antes de --apply.");
    return;
  }

  // 1) Eliminar inscripciones históricas inactivas de los dos ciclos.
  for (const c of ciclos) {
    const grupos = await get("grupos", "id", `&periodo_id=eq.${encodeURIComponent(c.id)}&limit=100000`);
    const ids = grupos.map((g) => g.id);
    if (!ids.length) continue;
    const filas = await get("inscripciones_alumno", "id", `&grupo_id=in.(${ids.join(",")})&activo=eq.false&limit=20000`);
    if (filas.length) await eliminarFilas("inscripciones_alumno", filas.map((f) => f.id));
    console.log(`[escrito] ${c.nombre}: ${filas.length} inscripciones históricas inactivas eliminadas.`);
  }

  // 2) RPC eliminar_ciclo sobre cada ciclo (una transacción cada una).
  for (const c of ciclos) {
    const res = await rpcEliminarCiclo(c.id);
    console.log(`[rpc] eliminar_ciclo(${c.nombre}) -> ok: ${JSON.stringify(res)}`);
  }

  // 3) Renombrar el operativo.
  const r = await fetch(`${urlBase}/rest/v1/periodos?id=eq.${encodeURIComponent(operativo.id)}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: NOMBRE_NUEVO_OPERATIVO }),
  });
  if (!r.ok) throw new Error(`PATCH periodos renombre -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  console.log(`[escrito] operativo renombrado a "${NOMBRE_NUEVO_OPERATIVO}".`);


  // 4) Verificación post.
  const operativoPost = (await get("periodos", "id,nombre,activo,estado", "&limit=50")).find((p) => String(p.id) === operativo.id);
  const despues = await capturarOperativo(operativo.id);
  console.log(`\n=== OPERATIVO DESPUÉS ===`);
  console.log(`  nombre=${operativoPost?.nombre} · grupos=${despues.grupos} · materias activas=${despues.materiasActivas} · inscripciones activas=${despues.inscripcionesActivas} · bloques horario=${despues.bloquesHorario} · días calendario=${despues.diasCalendario} · asignaciones activas=${despues.asignacionesActivas}`);
  const igual =
    antes.grupos === despues.grupos &&
    antes.materiasActivas === despues.materiasActivas &&
    antes.inscripcionesActivas === despues.inscripcionesActivas &&
    antes.bloquesHorario === despues.bloquesHorario &&
    antes.diasCalendario === despues.diasCalendario &&
    antes.asignacionesActivas === despues.asignacionesActivas;
  console.log(`\n¿Las seis cifras del operativo NO cambiaron? ${igual ? "SÍ ✅" : "NO ❌ (REVISAR Y REVERTIR)"}`);
  if (!igual) process.exit(2);
}

main().catch((e) => {
  console.error("ERROR:", e.message ?? e);
  process.exit(1);
});

