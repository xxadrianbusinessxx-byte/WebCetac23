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
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const hdr = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const curp = "OUCB070914MMCLSRA3";
const cols = ["ETIQUETA 1", "ETIQUETA 2", "ETIQUETA 3", "ETIQUETA1", "ETIQUETA2", "ETIQUETA3"];
for (const c of cols) {
  const r = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent("ETIQUETAS PERSONALES")}?CURP=eq.${curp}`,
    {
      method: "PATCH",
      headers: hdr,
      body: JSON.stringify({ [c]: "demo" }),
    },
  );
  const t = await r.text();
  if (r.status === 200) console.log("PATCH OK", c, t.slice(0, 200));
  else if (!t.includes("Could not find")) console.log(c, r.status, t.slice(0, 200));
}
