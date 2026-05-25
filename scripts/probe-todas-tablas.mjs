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
const key =
  env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const r = await fetch(`${urlBase}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const spec = await r.json();
const defs = spec.definitions ?? spec;
const tablas = Object.keys(defs).filter((k) => !k.startsWith("rpc_")).sort();

console.log("TOTAL tablas en Supabase:", tablas.length);
console.log("--- primeras 30 ---");
tablas.slice(0, 30).forEach((t) => console.log(t));
console.log("--- registros (REGISTRO) ---");
tablas.filter((t) => /REGISTRO/i.test(t)).forEach((t) => console.log(t));
console.log("--- muestra materia 6TO B MECATRONICA ---");
tablas
  .filter((t) => t.includes("6TO") && t.includes("MECATRONICA"))
  .slice(0, 15)
  .forEach((t) => console.log(t));

// compare with local list
const materiasPath = path.join(root, "lib", "escolar", "materias-list.ts");
const regPath = path.join(root, "lib", "escolar", "registros-list.ts");
const materiasSrc = fs.readFileSync(materiasPath, "utf8");
const regSrc = fs.readFileSync(regPath, "utf8");
const materiasLocal = [...materiasSrc.matchAll(/"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((s) => /^\d/.test(s));
const regLocal = [...regSrc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const setSupa = new Set(tablas);
const norm = (s) => s.trim().toUpperCase().replace(/\s+/g, " ");

let missM = 0;
for (const m of materiasLocal.slice(0, 5)) {
  if (!setSupa.has(m)) {
    const alt = tablas.find((t) => norm(t) === norm(m));
    console.log("MISS materia:", m, alt ? `=> ALT: ${alt}` : "");
    missM++;
  }
}
console.log("materias local:", materiasLocal.length, "missing sample:", missM);

let missR = 0;
for (const m of regLocal) {
  if (!setSupa.has(m)) {
    const alt = tablas.find((t) => norm(t) === norm(m));
    console.log("MISS registro:", m, alt ? `=> ALT: ${alt}` : "");
    missR++;
  }
}
console.log("registros local:", regLocal.length, "missing:", missR);
