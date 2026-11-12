// diag-alumnos-prueba.mjs — DIAGNÓSTICO (SOLO LECTURA) — PROMPT AC.
//
// Mide el alumno de prueba de los perfiles de visualización, antes y después:
//   - si la columna ALUMNOS.es_prueba existe (42703 → «no aplicada»);
//   - cuántos alumnos tienen es_prueba = true;
//   - el padrón del ciclo operativo (inscripciones_alumno activas en grupos de
//     ese periodos.id) CON y SIN los de prueba: la diferencia es lo que la app
//     deja de mostrar en las listas del personal;
//   - la cuenta genérica DIRECTIVO de PROFESORES (ID y Permisos, nunca CLAVE).
// Solo GET por REST. Imprime CONTEOS: ni CURP, ni claves, ni nombres de alumnos.
// Lee .env.local igual que scripts/diag-alta-manual-alumno.mjs.
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
const H = { apikey: key, Authorization: `Bearer ${key}` };

async function getCrudo(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  return { ok: r.ok, data: await r.json() };
}

async function get(tabla, select, extra = "") {
  const r = await getCrudo(tabla, select, extra);
  if (!r.ok) throw new Error(`${tabla} -> ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
}

/** Todas las filas, paginando de 1000 en 1000 (el tope de PostgREST). */
async function getTodo(tabla, select, extra = "") {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const lote = await get(tabla, select, `${extra}&limit=1000&offset=${desde}`);
    filas.push(...lote);
    if (lote.length < 1000) return filas;
  }
}

async function main() {
  const prueba = await getCrudo("ALUMNOS", "CURP", "&es_prueba=eq.true");
  const columnaAplicada = prueba.ok;
  if (!prueba.ok && !/42703|does not exist/i.test(JSON.stringify(prueba.data))) {
    throw new Error(`ALUMNOS.es_prueba -> ${JSON.stringify(prueba.data).slice(0, 300)}`);
  }
  const curpsPrueba = new Set(
    (columnaAplicada ? prueba.data : []).map((a) => String(a.CURP ?? "").trim().toUpperCase()),
  );

  const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
  const operativos = periodos.filter((p) => String(p.estado ?? "").toLowerCase() === "operativo");
  const operativo =
    operativos.length === 1
      ? operativos[0]
      : periodos.filter((p) => p.activo).length === 1
        ? periodos.find((p) => p.activo)
        : null;

  let padron = 0;
  let padronSinPrueba = 0;
  if (operativo) {
    const grupos = await get("grupos", "id", `&periodo_id=eq.${operativo.id}`);
    const ids = new Set(grupos.map((g) => String(g.id)));
    const ins = await getTodo("inscripciones_alumno", "curp,grupo_id", "&activo=eq.true");
    const curps = new Set(
      ins.filter((f) => ids.has(String(f.grupo_id))).map((f) => String(f.curp ?? "").trim().toUpperCase()),
    );
    padron = curps.size;
    padronSinPrueba = [...curps].filter((c) => !curpsPrueba.has(c)).length;
  }

  const directivo = await get(
    "PROFESORES",
    "ID,Permisos,debe_cambiar_credenciales",
    // La columna lleva «/»: PostgREST la exige entre comillas dobles.
    `&${encodeURIComponent('"NOMBRE/PROFESOR/DIRECTIVO"')}=eq.DIRECTIVO`,
  );

  console.log("=== ALUMNO DE PRUEBA — MEDICIÓN ===");
  console.log(`columna ALUMNOS.es_prueba       ${columnaAplicada ? "aplicada" : "no aplicada"}`);
  console.log(`alumnos con es_prueba = true    ${curpsPrueba.size}`);
  console.log(`periodo operativo               ${operativo ? operativo.nombre : "(ninguno único)"}`);
  console.log(`padrón del operativo            ${padron}`);
  console.log(`padrón sin los de prueba        ${padronSinPrueba}`);
  console.log(
    `cuenta DIRECTIVO (PROFESORES)   ${
      directivo.length === 0
        ? "no existe"
        : directivo.map((d) => `ID ${d.ID} · ${String(d.Permisos).trim()} · debe_cambiar=${d.debe_cambiar_credenciales}`).join(" | ")
    }`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
