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
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}

const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function api(pathname, opts = {}) {
  const r = await fetch(`${urlBase}/rest/v1/${pathname}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: r.status, json };
}

// ============================================================================
// PASO 1 — VERIFICAR ESTRUCTURA (OpenAPI)
// ============================================================================
console.log("=== PASO 1: VERIFICAR ESTRUCTURA DE TABLAS ===\n");
const r = await fetch(`${urlBase}/rest/v1/`, { headers: H });
const spec = await r.json();
const defs = spec.definitions ?? spec;

const esperado = {
  calendario_escolar: ["id", "ciclo_escolar", "fecha", "tipo", "descripcion", "creado_por", "created_at"],
  clases_impartidas: ["id", "profesor_clave", "grado", "grupo", "carrera", "fecha", "clases", "created_at", "updated_at"],
  asistencia_alumnos: ["id", "curp", "grado", "grupo", "carrera", "nombre", "fecha", "clases_asistidas", "created_at", "updated_at"],
};

for (const [tabla, cols] of Object.entries(esperado)) {
  const t = defs[tabla];
  if (!t?.properties) {
    console.log(`TABLA ${tabla} => NO EXISTE ❌`);
    continue;
  }
  const props = Object.keys(t.properties);
  const faltan = cols.filter((c) => !props.includes(c));
  const sobrantes = props.filter((c) => !cols.includes(c));
  console.log(`TABLA ${tabla} => EXISTE ✅`);
  console.log(`  Columnas: ${props.join(", ")}`);
  if (faltan.length) console.log(`  FALTAN: ${faltan.join(", ")} ❌`);
  if (sobrantes.length) console.log(`  SOBRANTES: ${sobrantes.join(", ")}`);
  // tipos
  for (const c of cols) {
    const p = t.properties[c];
    if (p) console.log(`    ${c}: ${p.format || p.type}`);
  }
  console.log("");
}

// ============================================================================
// PASO 2 — VERIFICAR QUE LAS TABLAS ESTÉN VACÍAS
// ============================================================================
console.log("=== PASO 2: VERIFICAR TABLAS VACÍAS ===\n");
for (const tabla of Object.keys(esperado)) {
  const { status, json } = await api(`${tabla}?select=*&limit=1`);
  const count = Array.isArray(json) ? json.length : "?";
  console.log(`TABLA ${tabla} => filas: ${count} (status ${status})`);
}
console.log("");

// ============================================================================
// PASO 3 — PRUEBA DE UPSERT (clases_impartidas)
// ============================================================================
console.log("=== PASO 3: PRUEBA DE UPSERT (clases_impartidas) ===\n");
const FECHA = "2026-08-24";
const GRADO = "1RO";
const GRUPO = "A";
const PROF = "TEST";

// 3.1 INSERT inicial: 3
let res = await api("clases_impartidas", {
  method: "POST",
  body: JSON.stringify({ profesor_clave: PROF, grado: GRADO, grupo: GRUPO, fecha: FECHA, clases: 3 }),
  headers: { Prefer: "return=representation" },
});
console.log(`INSERT inicial (clases=3): status ${res.status}`);
if (res.status === 201) console.log(`  -> fila creada: clases=${res.json[0]?.clases}`);

// 3.2 UPSERT con 3 (debe seguir siendo 3, un solo registro)
// Nota: PostgREST upsert requiere on_conflict=<clave natural> en la query.
res = await api(`clases_impartidas?on_conflict=profesor_clave,grado,grupo,fecha`, {
  method: "POST",
  body: JSON.stringify({ profesor_clave: PROF, grado: GRADO, grupo: GRUPO, fecha: FECHA, clases: 3 }),
  headers: { Prefer: "resolution=merge-duplicates,return=representation" },
});
console.log(`UPSERT (clases=3): status ${res.status}`);
const filas3 = await api(`clases_impartidas?profesor_clave=eq.${PROF}&grado=eq.${GRADO}&grupo=eq.${GRUPO}&fecha=eq.${FECHA}&select=clases`);
console.log(`  -> registros para (${PROF},${GRADO},${GRUPO},${FECHA}): ${filas3.json.length}, clases=${filas3.json[0]?.clases}`);

// 3.3 UPSERT con 4 (debe quedar 4, un solo registro)
res = await api(`clases_impartidas?on_conflict=profesor_clave,grado,grupo,fecha`, {
  method: "POST",
  body: JSON.stringify({ profesor_clave: PROF, grado: GRADO, grupo: GRUPO, fecha: FECHA, clases: 4 }),
  headers: { Prefer: "resolution=merge-duplicates,return=representation" },
});
console.log(`UPSERT (clases=4): status ${res.status}`);
const filas4 = await api(`clases_impartidas?profesor_clave=eq.${PROF}&grado=eq.${GRADO}&grupo=eq.${GRUPO}&fecha=eq.${FECHA}&select=clases`);
console.log(`  -> registros para (${PROF},${GRADO},${GRUPO},${FECHA}): ${filas4.json.length}, clases=${filas4.json[0]?.clases}`);
console.log("");


// ============================================================================
// PASO 4 — PRUEBA DEL SUM (total del grupo)
// ============================================================================
console.log("=== PASO 4: PRUEBA DEL SUM (total del grupo) ===\n");
// Insertar TEST-A, TEST-B, TEST-C con 3 cada uno
for (const p of ["TEST-A", "TEST-B", "TEST-C"]) {
  await api("clases_impartidas", {
    method: "POST",
    body: JSON.stringify({ profesor_clave: p, grado: GRADO, grupo: GRUPO, fecha: FECHA, clases: 3 }),
  });
}
// SUM actual (debe ser 9: TEST=4 + A=3 + B=3 + C=3 = 13... pero TEST ya es 4)
// Nota: TEST quedó en 4 del paso 3. Para el SUM limpio usamos solo A/B/C.
// Recalculemos: A=3, B=3, C=3 => SUM=9
const sum1 = await api(`clases_impartidas?grado=eq.${GRADO}&grupo=eq.${GRUPO}&fecha=eq.${FECHA}&select=clases`);
const total1 = sum1.json.reduce((acc, r) => acc + r.clases, 0);
console.log(`SUM con A=3,B=3,C=3 (más TEST=4): ${total1}`);

// Modificar TEST-B: 3 -> 4
await api(`clases_impartidas?profesor_clave=eq.TEST-B&grado=eq.${GRADO}&grupo=eq.${GRUPO}&fecha=eq.${FECHA}`, {
  method: "PATCH",
  body: JSON.stringify({ clases: 4 }),
});
const sum2 = await api(`clases_impartidas?grado=eq.${GRADO}&grupo=eq.${GRUPO}&fecha=eq.${FECHA}&select=clases`);
const total2 = sum2.json.reduce((acc, r) => acc + r.clases, 0);
console.log(`SUM después de TEST-B 3->4: ${total2}`);
console.log("");

// ============================================================================
// PASO 5 — LIMPIEZA (eliminar datos de prueba)
// ============================================================================
console.log("=== PASO 5: LIMPIEZA DE DATOS DE PRUEBA ===\n");
// Eliminar todos los registros de prueba (profesor_clave LIKE 'TEST%')
const del = await api(`clases_impartidas?profesor_clave=like.TEST*`, { method: "DELETE" });
console.log(`DELETE registros TEST en clases_impartidas: status ${del.status}`);

// Verificar que las tablas quedaron vacías
for (const tabla of Object.keys(esperado)) {
  const { status, json } = await api(`${tabla}?select=*&limit=1`);
  const count = Array.isArray(json) ? json.length : "?";
  console.log(`TABLA ${tabla} => filas restantes: ${count} (status ${status})`);
}
console.log("\n=== VERIFICACIÓN COMPLETA ===");
