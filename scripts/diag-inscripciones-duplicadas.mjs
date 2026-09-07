// diag-inscripciones-duplicadas.mjs — DIAGNÓSTICO (SOLO LECTURA) — PROMPT-1/T3.
// Lista cada CURP con MÁS DE UNA inscripción activa en `inscripciones_alumno`
// con el detalle de sus inscripciones (grupo, carrera, activo, ciclo,
// semestre) y, si se pasa la carpeta de roster (parámetro obligatorio),
// cruza contra los Excels para proponer cuál inscripción queda activa.
// NO escribe nada.
//
// Uso:
//   node scripts/diag-inscripciones-duplicadas.mjs
//   node scripts/diag-inscripciones-duplicadas.mjs --roster "C:\\ruta\\a\\carpeta"
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const root = path.join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const rosterArg = args.find((a) => a.startsWith("--roster="));
const rosterCarpeta = rosterArg ? rosterArg.slice("--roster=".length) : null;

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

function normalizarCurp(v) {
  return String(v ?? "").trim().toUpperCase();
}

const gradoASemestre = (grado) => {
  const base = String(grado ?? "").toUpperCase().match(/^\s*(\d)/);
  if (!base) return null;
  const n = Number(base[1]);
  return n >= 1 && n <= 6 ? n : null;
};

async function main() {
  const [ins, grupos, periodos, semestres, carreras] = await Promise.all([
    get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at", "&limit=20000"),
    get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", "&limit=5000"),
    get("periodos", "id,nombre,activo,estado", "&limit=50"),
    get("academico_semestres", "periodo_id,semestre,activo", "&limit=200").catch(() => []),
    get("carreras", "id,clave,nombre,activo", "&limit=200").catch(() => []),
  ]);
  const gPorId = new Map(grupos.map((g) => [g.id, g]));
  const pPorId = new Map(periodos.map((p) => [p.id, p]));
  const cPorId = new Map(carreras.map((c) => [c.id, c.clave]));
  const semInactivos = new Set(semestres.filter((s) => s.activo === false).map((s) => `${s.periodo_id}|${s.semestre}`));

  const porCurp = new Map();
  for (const i of ins) {
    if (!i.activo) continue;
    const c = normalizarCurp(i.curp);
    if (!c) continue;
    if (!porCurp.has(c)) porCurp.set(c, []);
    porCurp.get(c).push(i);
  }
  const dups = [...porCurp.entries()].filter(([, l]) => l.length > 1);

  console.log(`=== INSCRIPCIONES DUPLICADAS (activas) ===`);
  console.log(`CURPs con >1 inscripción activa: ${dups.length}`);
  console.log(`Inscripciones activas totales: ${[...porCurp.values()].reduce((s, l) => s + l.length, 0)}`);

  // Roster por CURP si hay carpeta.
  let curpsRoster = new Set();
  let nArchivos = 0;
  if (rosterCarpeta && fs.existsSync(rosterCarpeta)) {
    const archivos = fs.readdirSync(rosterCarpeta).filter((f) => /\.xlsx?$/i.test(f));
    nArchivos = archivos.length;
    for (const f of archivos) {
      const wb = XLSX.read(fs.readFileSync(path.join(rosterCarpeta, f)), { type: "buffer" });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });
      for (const row of rows) {
        for (const cell of row) {
          const c = normalizarCurp(cell);
          if (/^[A-Z0-9]{18}$/.test(c)) curpsRoster.add(c);
        }
      }
    }
    console.log(`Roster: ${archivos.length} archivos leídos de "${rosterCarpeta}"`);
  } else if (rosterCarpeta) {
    console.log(`Roster: la carpeta "${rosterCarpeta}" no existe o no es legible`);
  } else {
    console.log(`Roster: no se pasó --roster (solo listado)`);
  }

  for (const [curp, lista] of dups) {
    console.log(`\nCURP ${curp}  (en roster: ${curpsRoster.has(curp) ? "SÍ" : "NO"})`);
    for (const i of lista) {
      const g = gPorId.get(i.grupo_id);
      const p = g ? pPorId.get(g.periodo_id) : null;
      const carrera = g && g.carrera_id ? cPorId.get(g.carrera_id) ?? "" : "";
      const sem = g ? gradoASemestre(g.grado) : null;
      const semInact = g && sem != null ? semInactivos.has(`${g.periodo_id}|${sem}`) : false;
      console.log(
        `  ${i.id}  grupo=${g ? `${g.grado} ${g.nombre}${carrera ? " " + carrera : ""}` : "(sin grupo)"}  ` +
          `ciclo=${p?.nombre ?? "(sin ciclo)"}  semestre=${sem ?? "?"}${semInact ? " (INACTIVO)" : ""}  ` +
          `activo=${i.activo}  creado=${String(i.created_at).slice(0, 10)}`,
      );
    }
  }
  console.log(`\nCURPs duplicados sin match en roster: ${dups.filter(([c]) => !curpsRoster.has(c)).length}`);
  console.log("\nFIN (solo lectura)");
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});

