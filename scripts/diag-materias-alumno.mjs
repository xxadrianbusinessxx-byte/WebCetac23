// diag-materias-alumno.mjs — DIAGNÓSTICO (SOLO LECTURA)
// ¿Por qué a los alumnos no les aparecen materias en /perfil?
// Recorre la MISMA cadena que actionObtenerPerfilAlumno:
//   CURP → inscripciones_alumno(activo) → grupos(activo) → periodos(activo)
//        → grupo_materias(activo) → tabla_legacy → materias(activo)
// y además prueba la RPC obtener_perfil_alumno (que tiene prioridad en el
// código). NO modifica nada.
import fs from "node:fs";
import path from "node:path";

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
  const r = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} → ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function rpc(fn, body) {
  const r = await fetch(`${urlBase}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  return { status: r.status, data };
}

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
  const operativos = periodos.filter((p) => p.activo === true);
  console.log("=== PERIODOS activo=true ===");
  for (const p of operativos) console.log(`  [${p.id.slice(0, 8)}] ${p.nombre} estado=${p.estado ?? "(sin columna)"}`);
  if (operativos.length !== 1) {
    console.log(`  !! Hay ${operativos.length} periodos activos. resolverGrupoAlumno exige periodo activo.`);
  }
  const op = operativos[0];
  if (!op) return console.log("\nSIN PERIODO ACTIVO → ningún alumno verá materias. FIN.");

  // Cobertura de tabla_legacy POR PERIODO (¿qué periodo puede servir de origen?)
  console.log("\n=== COBERTURA DE tabla_legacy POR PERIODO ===");
  const todosGrupos = await get("grupos", "id,periodo_id,grado,nombre", "&limit=2000");
  const todosGm = await get("grupo_materias", "grupo_id,materia_id,activo,tabla_legacy", "&limit=20000");
  const periodoDeGrupo = new Map(todosGrupos.map((g) => [g.id, g.periodo_id]));
  const cobertura = new Map();
  for (const gm of todosGm) {
    if (!gm.activo) continue;
    const pid = periodoDeGrupo.get(gm.grupo_id);
    if (!pid) continue;
    const e = cobertura.get(pid) ?? { total: 0, conTabla: 0 };
    e.total++;
    if ((gm.tabla_legacy ?? "").trim() !== "") e.conTabla++;
    cobertura.set(pid, e);
  }
  for (const p of periodos) {
    const e = cobertura.get(p.id) ?? { total: 0, conTabla: 0 };
    const pct = e.total ? Math.round((e.conTabla / e.total) * 100) : 0;
    const marca = p.activo ? "  <-- OPERATIVO" : "";
    console.log(`  ${p.nombre.padEnd(20)} gmAct=${String(e.total).padStart(4)} · conTabla=${String(e.conTabla).padStart(4)} (${pct}%)${marca}`);
  }

  const grupos = await get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", `&periodo_id=eq.${op.id}&limit=200`);
  console.log(`\n=== GRUPOS del periodo operativo (${grupos.length}) ===`);
  const gruposActivos = grupos.filter((g) => g.activo);
  console.log(`  activo=true: ${gruposActivos.length} · activo=false: ${grupos.length - gruposActivos.length}`);

  const ids = grupos.map((g) => g.id);
  const gms = await get(
    "grupo_materias",
    "id,grupo_id,materia_id,activo,tabla_legacy",
    `&grupo_id=in.(${ids.join(",")})&limit=5000`,
  );
  const gmAct = gms.filter((g) => g.activo);
  const conTabla = gmAct.filter((g) => (g.tabla_legacy ?? "").trim() !== "");
  console.log(`\n=== GRUPO_MATERIAS del periodo (${gms.length}) ===`);
  console.log(`  activo=true: ${gmAct.length}`);
  console.log(`  activo=true CON tabla_legacy: ${conTabla.length}`);
  console.log(`  activo=true SIN tabla_legacy: ${gmAct.length - conTabla.length}   <-- si es alto, ESTA es la causa`);

  const materiaIds = [...new Set(gmAct.map((g) => g.materia_id).filter(Boolean))];
  const materias = materiaIds.length
    ? await get("materias", "id,clave,nombre,activo", `&id=in.(${materiaIds.join(",")})&limit=2000`)
    : [];
  const matAct = materias.filter((m) => m.activo);
  console.log(`\n=== MATERIAS referenciadas (${materias.length}) ===`);
  console.log(`  activo=true: ${matAct.length} · activo=false: ${materias.length - matAct.length}`);

  // Desglose por grupo
  console.log(`\n=== POR GRUPO (gm activas / con tabla_legacy) ===`);
  const porGrupo = new Map();
  for (const g of gmAct) {
    const e = porGrupo.get(g.grupo_id) ?? { act: 0, tabla: 0 };
    e.act++;
    if ((g.tabla_legacy ?? "").trim() !== "") e.tabla++;
    porGrupo.set(g.grupo_id, e);
  }
  for (const g of grupos) {
    const e = porGrupo.get(g.id) ?? { act: 0, tabla: 0 };
    const marca = e.tabla === 0 ? "  <-- SIN MATERIAS VISIBLES" : "";
    console.log(`  ${g.grado} ${g.nombre}  activo=${g.activo} · gmAct=${e.act} · conTabla=${e.tabla}${marca}`);
  }

  // Alumno real de muestra
  const ins = await get(
    "inscripciones_alumno",
    "curp,grupo_id,activo",
    `&grupo_id=in.(${ids.join(",")})&activo=is.true&limit=5`,
  );
  console.log(`\n=== MUESTRA DE ALUMNOS INSCRITOS (${ins.length}) ===`);
  for (const i of ins) {
    const g = grupos.find((x) => x.id === i.grupo_id);
    const e = porGrupo.get(i.grupo_id) ?? { act: 0, tabla: 0 };
    console.log(`  ${i.curp} → ${g ? `${g.grado} ${g.nombre}` : "(grupo desconocido)"} · materias visibles esperadas = ${e.tabla}`);
  }

  // RPC: tiene prioridad sobre el flujo directo en actionObtenerPerfilAlumno
  if (ins[0]) {
    console.log(`\n=== RPC obtener_perfil_alumno('${ins[0].curp}') ===`);
    const r = await rpc("obtener_perfil_alumno", { p_curp: ins[0].curp });
    if (r.status !== 200) {
      console.log(`  status=${r.status} → ${JSON.stringify(r.data).slice(0, 200)}`);
      console.log("  (si no existe, la app usa el flujo directo O1)");
    } else {
      const d = r.data ?? {};
      console.log(`  inscripcion: ${d.inscripcion ? "sí" : "NULL"}`);
      console.log(`  grupo:       ${d.grupo ? `${d.grupo.grado} ${d.grupo.nombre}` : "NULL"}`);
      console.log(`  periodo:     ${d.periodo ? d.periodo.nombre : "NULL"}`);
      console.log(`  grupo_materias: ${(d.grupo_materias ?? []).length}`);
      console.log(`  identidades:    ${(d.identidades ?? []).length}   <-- lo que la UI convierte en materias`);
      console.log(`  semestres:      ${(d.semestres ?? []).length}`);
    }
  }

  console.log("\n=== academico_semestres del periodo ===");
  const sem = await get("academico_semestres", "periodo_id,semestre,activo", `&periodo_id=eq.${op.id}&limit=50`);
  if (sem.length === 0) console.log("  (sin filas ⇒ todos los semestres activos por default)");
  for (const s of sem) console.log(`  S${s.semestre} activo=${s.activo}`);

  console.log("\nFIN DIAGNÓSTICO");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
