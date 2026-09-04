// diag-relaciones-supabase.mjs — DIAGNÓSTICO (SOLO LECTURA)
// Mapa REAL de identificadores y relaciones (FK) entre las tablas del sistema,
// leído del spec OpenAPI que publica PostgREST. Sirve para decidir por qué
// columna debe relacionarse cada módulo (UUID vs texto vs CURP).
// NO modifica nada.
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

// Tablas del núcleo académico/asistencia (el resto son 241 tablas de materia).
const TABLAS = [
  "PROFESORES", "ALUMNOS",
  "periodos", "periodos_evaluacion", "carreras", "grupos", "materias",
  "grupo_materias", "inscripciones_alumno", "asignaciones_profesor",
  "academico_semestres", "horario_semanal",
  "calendario_escolar", "clases_impartidas", "asistencia_alumnos",
  "justificaciones_asistencia", "tutores", "tutor_alumnos",
];

const RE_PK = /<pk\/>/i;
const RE_FK = /<fk table='([^']+)' column='([^']+)'\/>/i;

function analizar(def) {
  const props = def?.properties ?? {};
  const salida = [];
  for (const [col, meta] of Object.entries(props)) {
    const desc = String(meta.description ?? "");
    const fk = desc.match(RE_FK);
    salida.push({
      col,
      tipo: meta.format ?? meta.type ?? "?",
      pk: RE_PK.test(desc),
      fk: fk ? `${fk[1]}.${fk[2]}` : null,
    });
  }
  return salida;
}

async function main() {
  const r = await fetch(`${urlBase}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await r.json();
  const defs = spec.definitions ?? spec;

  const aristas = [];
  const huerfanas = [];

  console.log("=== IDENTIDAD Y RELACIONES POR TABLA ===\n");
  for (const tabla of TABLAS) {
    const def = defs[tabla];
    if (!def) { console.log(`${tabla}: (no existe en el spec)\n`); continue; }
    const cols = analizar(def);
    const pk = cols.filter((c) => c.pk).map((c) => `${c.col}:${c.tipo}`);
    const fks = cols.filter((c) => c.fk);
    console.log(`## ${tabla}`);
    console.log(`   PK: ${pk.length ? pk.join(", ") : "(sin PK declarada)"}`);
    if (fks.length) {
      for (const c of fks) {
        console.log(`   FK: ${c.col} → ${c.fk}`);
        aristas.push(`${tabla}.${c.col} → ${c.fk}`);
      }
    } else {
      console.log("   FK: (ninguna)");
    }
    // Columnas que SON identidad pero sin FK declarada = relación "suelta"
    const sueltas = cols.filter(
      (c) => !c.fk && !c.pk && /^(curp|curp_alumno|profesor_clave|materia_clave|ciclo_escolar|tabla_legacy|solicitante_id|CURP|CLAVE)$/i.test(c.col),
    );
    if (sueltas.length) {
      console.log(`   ⚠ sin FK: ${sueltas.map((c) => `${c.col}:${c.tipo}`).join(", ")}`);
      for (const c of sueltas) huerfanas.push(`${tabla}.${c.col} (${c.tipo})`);
    }
    console.log("");
  }

  console.log("=== RELACIONES SUELTAS (por valor, sin FK) ===");
  console.log("Estas son las que hay que vigilar: se rompen en silencio.\n");
  for (const h of huerfanas) console.log(`  ${h}`);

  console.log(`\n=== RESUMEN ===`);
  console.log(`  FK declaradas : ${aristas.length}`);
  console.log(`  Relaciones por valor (sin FK): ${huerfanas.length}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
