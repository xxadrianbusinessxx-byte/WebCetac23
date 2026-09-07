// actualizar-inscripciones-listas.mjs
// Alta (o reactivación) de inscripciones ACTIVAS en el ciclo OPERATIVO para los
// alumnos de las listas de things (nombres → CURP de ALUMNOS por coincidencia
// exacta y única). NO desactiva ninguna otra inscripción (decisión del
// directivo). Reversible: solo INSERT/UPDATE activo=true; nada se borra.
//
// Uso:
//   node scripts/actualizar-inscripciones-listas.mjs           # plan (dry-run)
//   node scripts/actualizar-inscripciones-listas.mjs --apply   # ejecuta
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const APPLY = process.argv.includes("--apply");
const ROOT = path.join(import.meta.dirname, "..");
const THINGS = "C:/Users/URINDOWS/Desktop/web/things/Alumnos CETAC";
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
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  const d = await r.json();
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}
async function post(tabla, body) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  if (!r.ok && r.status !== 201) throw new Error(`${tabla}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return true;
}
async function patch(tabla, id, body) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?id=eq.${id}`, {
    method: "PATCH", headers: H, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return true;
}

function normNombre(s) {
  return String(s ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-ZÑ0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Grupos objetivo (la lista 6TOMCA.xlsx es 5TO A MECATRONICA, decisión del directivo).
const OBJ = [
  ["3RORHA.xlsx", "3RO", "A", "RH", "3RO A RH"],
  ["5TORHA.xlsx", "5TO", "A", "RH", "5TO A RH"],
  ["6TOMCA.xlsx", "5TO", "A", "MECATRONICA", "5TO A MECATRONICA (lista 6TOMCA)"],
];

function leerNombres(file) {
  const wb = XLSX.readFile(path.join(THINGS, file));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const out = [];
  for (const fila of rows.slice(1)) {
    if (!fila || fila.every((c) => c == null || String(c).trim() === "")) continue;
    const n = normNombre(fila[0]);
    if (n) out.push(n);
  }
  return out;
}

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
  const op = periodos.find((p) => p.estado === "operativo" || p.activo === true);
  if (!op) throw new Error("No hay periodo operativo.");
  console.log(`${APPLY ? "APLICANDO" : "PLAN (dry-run)"} sobre periodo OPERATIVO: ${op.nombre} (${op.id})`);

  const carreras = await get("carreras", "id,clave", "&limit=100");
  const carreraPorId = new Map(carreras.map((c) => [c.id, c.clave]));
  const grupos = await get("grupos", "id,grado,nombre,carrera_id,periodo_id", "&limit=2000");
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const descGrupo = (id) => {
    const g = grupoPorId.get(id);
    return g ? `${g.grado} ${g.nombre} ${carreraPorId.get(g.carrera_id) ?? ""}`.trim() : id;
  };

  const alumnos = await get("ALUMNOS", "CURP,NOMBRE,P_APELLIDO,S_APELLIDO", "&limit=20000");
  const alPorNombre = new Map();
  for (const a of alumnos) {
    const n = normNombre([a.P_APELLIDO, a.S_APELLIDO, a.NOMBRE].filter(Boolean).join(" "));
    if (!n) continue;
    if (!alPorNombre.has(n)) alPorNombre.set(n, []);
    alPorNombre.get(n).push(a);
  }

  const insActivas = await get("inscripciones_alumno", "curp,grupo_id,activo", "&activo=eq.true&limit=20000");
  const activasPorCurp = new Map();
  for (const i of insActivas) {
    const c = String(i.curp).trim().toUpperCase();
    if (!activasPorCurp.has(c)) activasPorCurp.set(c, []);
    activasPorCurp.get(c).push(i.grupo_id);
  }

  let totalInsert = 0;
  let totalReact = 0;
  for (const [file, grado, grupo, carrera, etiqueta] of OBJ) {
    const g = grupos.find(
      (x) =>
        x.grado === grado && x.nombre === grupo &&
        (carreraPorId.get(x.carrera_id) ?? "") === carrera && x.periodo_id === op.id,
    );
    if (!g) { console.log(`\n## ${etiqueta}: grupo NO encontrado en el operativo.`); continue; }

    const insGrupo = await get("inscripciones_alumno", "id,curp,activo", `&grupo_id=eq.${g.id}&limit=5000`);
    const filaPorCurp = new Map();
    const activosEnGrupo = new Set();
    for (const i of insGrupo) {
      const c = String(i.curp).trim().toUpperCase();
      filaPorCurp.set(c, i);
      if (i.activo === true) activosEnGrupo.add(c);
    }

    const nombres = leerNombres(file);
    const aInsertar = [];
    const aReactivar = [];
    const ya = [];
    const sinCurp = [];
    const ambiguos = [];
    for (const nombre of nombres) {
      const m = alPorNombre.get(nombre) ?? [];
      if (m.length === 0) { sinCurp.push(nombre); continue; }
      if (m.length > 1) { ambiguos.push(`${nombre} (${m.length} en ALUMNOS)`); continue; }
      const curp = String(m[0].CURP).trim().toUpperCase();
      const fila = filaPorCurp.get(curp);
      if (fila && fila.activo === true) { ya.push(curp); continue; }
      const donde = (activasPorCurp.get(curp) ?? []).map(descGrupo).join(" ; ");
      if (fila && fila.activo !== true) aReactivar.push({ id: fila.id, curp, donde });
      else aInsertar.push({ curp, donde });
    }

    console.log(`\n## ${etiqueta} | grupo_id=${g.id} | en lista: ${nombres.length} | ya activos: ${ya.length}`);
    console.log(`   A INSERTAR: ${aInsertar.length} | A REACTIVAR: ${aReactivar.length} | SIN CURP: ${sinCurp.length} | AMBIGUOS: ${ambiguos.length}`);
    for (const s of sinCurp) console.log(`   SIN-CURP ${s}`);
    for (const s of ambiguos) console.log(`   AMBIGUO ${s}`);
    for (const a of aInsertar) console.log(`   + ${a.curp}  (hoy activo en: ${a.donde || "ninguno"})`);
    for (const a of aReactivar) console.log(`   ~ ${a.curp}  (hoy activo en: ${a.donde || "ninguno"})`);

    if (APPLY) {
      for (const a of aReactivar) {
        await patch("inscripciones_alumno", a.id, { activo: true });
        totalReact++;
      }
      if (aInsertar.length) {
        await post("inscripciones_alumno", aInsertar.map((a) => ({ curp: a.curp, grupo_id: g.id, activo: true })));
        totalInsert += aInsertar.length;
      }
    }
  }
  if (APPLY) {
    console.log(`\nEJECUTADO: ${totalInsert} insertadas, ${totalReact} reactivadas.`);
  } else {
    console.log("\nModo plan: nada escrito. Ejecuta con --apply para aplicar.");
  }
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });

