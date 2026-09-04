// diag-duplicados-ciclos.mjs — SOLO LECTURA: verifica si AGO2026-ENE2027 y
// AGO2026-DIC2026 tienen datos vinculados (para decidir limpieza segura).
import fs from "node:fs";
import path from "node:path";
const root = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = {};
for (const l of raw.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i < 1) continue; let v = t.slice(i + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); env[t.slice(0, i).trim()] = v; }
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
async function get(t, s, e = "") { const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(t)}?select=${encodeURIComponent(s)}${e}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); const d = await r.json(); if (!r.ok) throw new Error(`${t} ${r.status}`); return d; }
async function main() {
  const periodos = await get("periodos", "id,nombre,activo,created_at", "&limit=50");
  const dups = periodos.filter((p) => ["AGO2026-ENE2027", "AGO2026-DIC2026"].includes(p.nombre));
  const grupos = await get("grupos", "id,periodo_id", "&limit=5000");
  for (const p of dups) {
    const gs = grupos.filter((g) => g.periodo_id === p.id);
    const gids = gs.map((g) => g.id);
    const ins = gids.length ? await get("inscripciones_alumno", "id", `&grupo_id=in.(${gids.join(",")})&limit=5000`) : [];
    const gms = gids.length ? await get("grupo_materias", "id", `&grupo_id=in.(${gids.join(",")})&limit=5000`) : [];
    const hor = gids.length ? await get("horario_semanal", "id", `&periodo_id=eq.${p.id}&limit=5000`) : [];
    const ev = await get("periodos_evaluacion", "id", `&periodo_id=eq.${p.id}&limit=1000`);
    const sem = await get("academico_semestres", "id", `&periodo_id=eq.${p.id}&limit=1000`);
    const cal = await get("calendario_escolar", "id", `&ciclo_escolar=eq.${encodeURIComponent(p.nombre)}&limit=5000`);
    console.log(`\n[${p.nombre}] id=${p.id} activo=${p.activo}`);
    console.log(`  grupos=${gs.length} · inscripciones=${ins.length} · grupo_materias=${gms.length} · horario=${hor.length} · evaluaciones=${ev.length} · semestres=${sem.length} · calendario(texto)=${cal.length}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
