/**
 * Copia imágenes desde "decoraciones imagenes" (raíz del proyecto) a public/decoraciones-imagenes/
 * y regenera lib/decoraciones/imagenes-generadas.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const origenes = [
  path.join(root, "decoraciones imagenes"),
  path.join(root, "decoraciones-imagenes"),
];
const destino = path.join(root, "public", "decoraciones-imagenes");
const exts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

let origen = origenes.find((d) => fs.existsSync(d));
if (!origen) {
  console.log(
    "No se encontró carpeta 'decoraciones imagenes'. Crea una en la raíz del proyecto.",
  );
  fs.mkdirSync(destino, { recursive: true });
  process.exit(0);
}

fs.mkdirSync(destino, { recursive: true });
const archivos = fs.readdirSync(origen).filter((f) => exts.has(path.extname(f).toLowerCase()));

for (const f of archivos) {
  fs.copyFileSync(path.join(origen, f), path.join(destino, f));
  console.log("copiado:", f);
}

const ts = `/** Generado por npm run sync:decoraciones — no editar a mano */\nexport const DECORACIONES_GENERADAS: readonly string[] = ${JSON.stringify(archivos, null, 2)} as const;\n`;
fs.writeFileSync(path.join(root, "lib", "decoraciones", "imagenes-generadas.ts"), ts);
console.log(`Listo: ${archivos.length} imagen(es).`);
