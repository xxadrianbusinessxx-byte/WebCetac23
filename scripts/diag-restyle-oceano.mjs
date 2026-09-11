// diag-restyle-oceano.mjs - DIAGNOSTICO (SOLO LECTURA) - migracion visual Oceano.
// Mide cuanto queda del tema glass CLARO y cuanto hay ya del tema Oceano OSCURO:
//   - ocurrencias de clases glass claro por archivo, agrupadas por fase del plan;
//   - ocurrencias de tokens --oc-* (el tema nuevo) por archivo;
//   - porcentaje de avance por fase y total;
//   - opcional --json para comparar dos mediciones sin leer a ojo.
// Es el diagnostico que exige el CONTRATO (pasos 1 y 6) en las fases 1-7 del
// rediseño: se corre ANTES de tocar nada y OTRA VEZ al terminar.
// NO escribe nada. No abre Supabase: solo lee app/**/*.tsx del filesystem.
// Uso: node scripts/diag-restyle-oceano.mjs [--json] [--fase=N]
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const APP = path.join(root, "app");

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const FASE = (args.find((a) => a.startsWith("--fase=")) ?? "").split("=")[1] ?? null;

// Clases del tema CLARO que el rediseño debe retirar: cualquier literal de
// paleta Tailwind, que es exactamente lo que la deuda D11 existe para eliminar.
//
// RE-CALIBRADO el 2026-09-11. La version anterior solo miraba siete formas
// concretas (bg-white/N, text-sky-8NN, from-sky-N...) y veia el 42% del
// problema: 772 de 1832. Se le escapaban los degradados enteros —via-* y to-*
// no estaban— asi que sustituir solo el `from-` de una cadena dejaba el
// degradado roto Y el contador en verde. Un FALSO VERDE es peor que no medir.
//
// Consecuencia: las cifras anteriores al 2026-09-11 (baseline 905, luego 772)
// NO son comparables con las de ahora. Quedan en los commits como registro
// historico de su momento; la linea base real es la de abajo.
const CLARO =
  /\b(?:bg|text|border|from|via|to|ring|divide|outline|shadow|fill|stroke)-(?:white|black|slate|sky|red|emerald|amber|indigo|violet|rose|green|blue|cyan|teal|gray|zinc|orange|yellow|purple|pink|fuchsia|lime)(?:-[0-9]{2,3})?(?:\/[0-9]+)?\b/g;

// Tokens del tema OSCURO que el rediseño introduce (globals.css, Fase 1).
const OSCURO = /--oc-[a-z0-9-]+|var\(--oc-[a-z0-9-]+\)/g;

// Reparto de archivos por fase del plan. Un archivo sin fase asignada cuenta en
// el total pero no bloquea ninguna fase concreta.
const FASES = {
  1: [
    "app/globals.css",
    "app/layout.tsx",
    "app/page.tsx",
    // Fase 1 — shell Océano: la ruta de previsualización y sus cinco piezas.
    // Sin esta lista el shell nuevo cae en «sin fase asignada» y el invariante
    // de la fase (bajar claro · subir --oc-*) no se puede medir.
    "app/oceano/page.tsx",
    "app/components/oceano/shell-oceano.tsx",
    "app/components/oceano/nav-superior-oceano.tsx",
    "app/components/oceano/sidebar-oceano.tsx",
    "app/components/oceano/barra-modo-oceano.tsx",
    "app/components/oceano/contenido-marcador-oceano.tsx",
  ],
  2: [
    "app/perfil/perfil-client.tsx",
    "app/components/materia-selector.tsx",
    "app/components/materia-calificaciones-alumno.tsx",
    "app/components/horario-alumno-resumen.tsx",
    "app/components/calendario-asistencia-alumno.tsx",
    "app/components/etiquetas-dinamicas-panel.tsx",
    "app/components/materia-tabla-vista.tsx",
    // Fase 2 — pieza nueva del shell que monta las anteriores (sin esta lista
    // caería en «sin fase asignada» y el avance de la fase no la contaría).
    "app/components/oceano/contenido-alumno-oceano.tsx",
  ],
  4: ["app/tutor/tutor-client.tsx"],
  5: [
    "app/profesor/profesor-client.tsx",
    "app/components/materia-mapeo-columnas.tsx",
    "app/components/asistencias-panel.tsx",
    "app/components/buscador-alumno-profesor.tsx",
    "app/components/materias-config-panel.tsx",
  ],
  6: [
    "app/directivo/directivo-client.tsx",
    "app/components/justificaciones-admin.tsx",
    "app/components/calendario-escolar-panel.tsx",
  ],
  7: [
    "app/configuracion/configuracion-client.tsx",
    "app/components/asignaciones-admin.tsx",
    "app/components/baja-roster-panel.tsx",
    "app/components/deshacer-paso-panel.tsx",
    "app/components/profesores-credenciales-panel.tsx",
    "app/components/tutores-panel.tsx",
    "app/components/aliases-volumen-panel.tsx",
    "app/components/horario-escolar-panel.tsx",
    "app/components/ciclo-configurador/index.tsx",
    "app/components/ciclo-configurador/paso-datos.tsx",
    "app/components/ciclo-configurador/paso-academico.tsx",
    "app/components/ciclo-configurador/paso-alumnos.tsx",
    "app/components/ciclo-configurador/paso-evaluacion.tsx",
    "app/components/ciclo-configurador/paso-validacion.tsx",
  ],
};

const faseDe = (rel) => {
  for (const [n, lista] of Object.entries(FASES)) if (lista.includes(rel)) return Number(n);
  return null;
};

function archivos(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // _borrador queda FUERA del rediseño (codigo en borrador, no es superficie viva).
      if (e.name === "_borrador") continue;
      archivos(p, out);
    } else if (e.name.endsWith(".tsx") || e.name.endsWith(".css")) {
      out.push(p);
    }
  }
  return out;
}

const filas = [];
for (const abs of archivos(APP)) {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  const src = fs.readFileSync(abs, "utf8");
  const claro = (src.match(CLARO) ?? []).length;
  const oscuro = (src.match(OSCURO) ?? []).length;
  if (claro === 0 && oscuro === 0) continue;
  filas.push({ archivo: rel, claro, oscuro, fase: faseDe(rel) });
}

const sel = FASE ? filas.filter((f) => String(f.fase) === String(FASE)) : filas;
sel.sort((a, b) => b.claro - a.claro || a.archivo.localeCompare(b.archivo));

const sum = (xs, k) => xs.reduce((n, x) => n + x[k], 0);
const totalClaro = sum(sel, "claro");
const totalOscuro = sum(sel, "oscuro");
const avance = totalClaro + totalOscuro === 0
  ? 0
  : Math.round((totalOscuro / (totalClaro + totalOscuro)) * 100);

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { medido: new Date().toISOString().slice(0, 10), totalClaro, totalOscuro, avance, archivos: sel },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log("\nDIAG RESTYLE OCEANO — solo lectura, sin Supabase");
console.log(`Alcance: app/**/*.{tsx,css} sin app/_borrador/${FASE ? `  ·  fase ${FASE}` : ""}`);
console.log("".padEnd(78, "-"));
console.log("CLARO  OSCURO  FASE  ARCHIVO");
for (const f of sel) {
  console.log(
    `${String(f.claro).padStart(5)}  ${String(f.oscuro).padStart(6)}  ${String(f.fase ?? "-").padStart(4)}  ${f.archivo}`,
  );
}
console.log("".padEnd(78, "-"));
console.log(`Archivos con tema claro pendiente: ${sel.filter((f) => f.claro > 0).length}`);
console.log(`Ocurrencias de tema CLARO:  ${totalClaro}`);
console.log(`Ocurrencias de tema OSCURO: ${totalOscuro}`);
console.log(`Avance de migracion: ${avance}%`);

console.log("\nPor fase:");
for (const n of Object.keys(FASES)) {
  const g = filas.filter((f) => String(f.fase) === n);
  if (!g.length) continue;
  const c = sum(g, "claro");
  const o = sum(g, "oscuro");
  const pct = c + o === 0 ? 0 : Math.round((o / (c + o)) * 100);
  console.log(`  Fase ${n}: ${String(c).padStart(4)} claro · ${String(o).padStart(4)} oscuro · ${pct}%`);
}
const huerfanos = filas.filter((f) => f.fase === null && f.claro > 0);
if (huerfanos.length) {
  console.log(`\nSin fase asignada (${huerfanos.length} archivos, ${sum(huerfanos, "claro")} ocurrencias):`);
  for (const f of huerfanos) console.log(`  ${String(f.claro).padStart(4)}  ${f.archivo}`);
}
console.log("");
