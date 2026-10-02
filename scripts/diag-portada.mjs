// diag-portada.mjs — DIAGNÓSTICO (SOLO LECTURA). 2026-10-01, PROMPT U.
//
// QUÉ MIDE: el estado de la portada pública contra Supabase real.
//   1. Imágenes del carrusel (`portada_medios.tipo = 'imagen'`): cuántas y en qué
//      posiciones. El carrusel nunca tiene huecos.
//   2. Videos SUBIDOS a Cloudinary (`portada_medios.tipo = 'video'`). Desde el
//      PROMPT U el código ya no los muestra ni deja subir más: tienen que ser 0.
//      Si aparece alguno, quedó fuera de la portada y hay que pasarlo a enlace.
//   3. ¿Se ejecutó supabase/crear-portada-carreras.sql? (`portada_carreras`
//      vista por PostgREST, o PGRST205 si no existe).
//   4. Por cada carrera ACTIVA: su enlace, su formato, el largo de su texto y si
//      la URL guardada tiene la forma canónica que escribe `analizarEnlaceVideo`.
// QUÉ ESCRIBE: nada. Solo GET por PostgREST.
// CÓMO SE EJECUTA: node scripts/diag-portada.mjs
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

async function leer(tabla, select, filtro = "") {
  const r = await fetch(`${urlBase}/rest/v1/${tabla}?select=${encodeURIComponent(select)}${filtro}`, { headers: H });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) return { existe: cuerpo?.code !== "PGRST205", error: cuerpo?.message ?? `HTTP ${r.status}`, filas: [] };
  return { existe: true, error: null, filas: cuerpo ?? [] };
}

/** La forma canónica que guarda el servidor (portada-puro.ts · analizarEnlaceVideo). */
const CANONICA = [
  /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/,
  /^https:\/\/www\.youtube\.com\/shorts\/[A-Za-z0-9_-]{11}$/,
  /^https:\/\/www\.tiktok\.com\/@[A-Za-z0-9._]{1,30}\/video\/\d{15,22}$/,
];

// ── 1 y 2. portada_medios ──────────────────────────────────────────────────
const medios = await leer("portada_medios", "id,tipo,orden,carrera_id");
if (medios.error) {
  console.log(`portada_medios: ERROR ${medios.error}`);
} else {
  const imagenes = medios.filas.filter((f) => f.tipo === "imagen").sort((a, b) => a.orden - b.orden);
  const videos = medios.filas.filter((f) => f.tipo === "video");
  console.log(`1. Carrusel: ${imagenes.length} imagen(es) en las posiciones [${imagenes.map((f) => f.orden).join(", ")}]`);
  console.log(`2. Videos subidos a Cloudinary (portada_medios.tipo='video'): ${videos.length}` +
    (videos.length ? "  ← AVISO: la portada ya no los muestra; pásalos a enlace" : "  (correcto: deben ser 0)"));
}

// ── 3 y 4. portada_carreras ────────────────────────────────────────────────
const carreras = await leer("carreras", "id,clave,nombre", "&activo=eq.true&order=nombre");
const pc = await leer("portada_carreras", "carrera_id,video_url,video_formato,descripcion,updated_at");
if (!pc.existe) {
  console.log("3. portada_carreras: NO EXISTE (PGRST205). Falta ejecutar supabase/crear-portada-carreras.sql.");
  console.log("   La portada se pinta igual; en el panel no se pueden guardar enlaces ni textos.");
} else if (pc.error) {
  console.log(`3. portada_carreras: ERROR ${pc.error}`);
} else {
  console.log(`3. portada_carreras: existe, ${pc.filas.length} fila(s)`);
  const porCarrera = new Map(pc.filas.map((f) => [f.carrera_id, f]));
  console.log("4. Por carrera activa:");
  for (const c of carreras.filas) {
    const f = porCarrera.get(c.id);
    if (!f) {
      console.log(`   · ${c.clave}: sin video ni texto`);
      continue;
    }
    const url = f.video_url ?? "";
    const canonica = !url || CANONICA.some((re) => re.test(url));
    console.log(
      `   · ${c.clave}: video ${url ? `${url} (${f.video_formato})` : "—"}` +
        ` · texto ${f.descripcion ? `${f.descripcion.length} caracteres` : "—"}` +
        (canonica ? "" : "  ← AVISO: la URL no tiene la forma canónica; la portada no la mostrará"),
    );
  }
  const huerfanas = pc.filas.filter((f) => !carreras.filas.some((c) => c.id === f.carrera_id));
  if (huerfanas.length) console.log(`   ${huerfanas.length} fila(s) de carreras inactivas: no se muestran`);
}
