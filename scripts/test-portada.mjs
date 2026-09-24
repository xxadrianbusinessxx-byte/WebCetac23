#!/usr/bin/env node
/**
 * test-portada.mjs — suite pura de `lib/escolar/portada/portada-puro.ts`.
 *
 * QUÉ MIDE: las reglas de la portada administrable — qué imagen o video es
 *           válido, el orden del carrusel, los rótulos de carrera, los
 *           identificadores de Cloudinary y los ajustes de contacto.
 * QUÉ ESCRIBE: nada. Carga el `.ts` directamente. No toca la base ni la red.
 * CÓMO SE EJECUTA: node scripts/test-portada.mjs
 *
 * ── Por qué importa ────────────────────────────────────────────────────────
 * Estas reglas las usan el navegador (para avisar antes de subir) y el servidor
 * (para rechazar después, contra el archivo real). Si una regla se rompe, la
 * portada acepta una imagen deformada o rechaza una buena, y nadie lo ve hasta
 * que alguien de dirección intenta subirla.
 */
const P = await import("../lib/escolar/portada/portada-puro.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const img = (ancho, alto, extra = {}) =>
  P.validarImagen({ ancho, alto, bytes: 2_000_000, formato: "jpg", variante: "escritorio", ...extra });
const vid = (extra = {}) =>
  P.validarVideo({ ancho: 1920, alto: 1080, bytes: 30_000_000, formato: "mp4", duracion_s: 60, ...extra });

/* ── Proporción de escritorio: los bordes de la tolerancia ─────────────── */
console.log("\nimagen de escritorio — proporción 7:3 ± 3 %");
ok("2800×1200 (la ideal) pasa", img(2800, 1200).ok);
ok("2880×1231 (el propio diseño, 2,339) pasa", img(2880, 1231).ok);
// 3 % sobre 7:3 = [2,263 – 2,403]. El PROMPT L citaba 2,26 y 2,41 como
// válidos: los dos caen FUERA. Los bordes correctos son estos.
ok("2,27 : 1 pasa (dentro por abajo)", img(2270, 1000).ok);
ok("2,40 : 1 pasa (dentro por arriba)", img(2400, 1000).ok);
ok("2,25 : 1 NO pasa", !img(2250, 1000).ok);
ok("2,42 : 1 NO pasa", !img(2420, 1000).ok);

const foto169 = img(1920, 1080);
ok("una foto 16:9 se rechaza", !foto169.ok);
ok("…y el mensaje dice qué proporción tiene", !foto169.ok && foto169.error.includes("16:9"));
ok("…y qué hacer", !foto169.ok && foto169.error.includes("Recórtala a 2800 × 1200"));

const pequena = img(1050, 450);
ok("7:3 pero demasiado pequeña se rechaza", !pequena.ok && pequena.error.includes("borrosa"));
ok("el mínimo exacto (1400×600) pasa", img(1400, 600).ok);

/* ── Formato y peso ────────────────────────────────────────────────────── */
console.log("\nimagen — formato y peso");
ok("jpeg pasa (Cloudinary a veces dice jpg)", img(2800, 1200, { formato: "jpeg" }).ok);
ok("webp pasa", img(2800, 1200, { formato: "WEBP" }).ok);
ok("gif se rechaza", !img(2800, 1200, { formato: "gif" }).ok);
ok("10 MB exactos pasan", img(2800, 1200, { bytes: P.MAX_BYTES_IMAGEN }).ok);
ok("un byte de más se rechaza", !img(2800, 1200, { bytes: P.MAX_BYTES_IMAGEN + 1 }).ok);

/* ── Variante móvil ────────────────────────────────────────────────────── */
console.log("\nimagen para teléfono — 4:5 vertical");
ok("1080×1350 (la ideal) pasa", img(1080, 1350, { variante: "movil" }).ok);
ok("una horizontal 7:3 NO sirve como móvil", !img(2800, 1200, { variante: "movil" }).ok);
const movilMal = img(1080, 1920, { variante: "movil" });
ok("9:16 se rechaza y dice «para teléfono»", !movilMal.ok && movilMal.error.includes("teléfono"));

/* ── Video ─────────────────────────────────────────────────────────────── */
console.log("\nvideo — 16:9, formato, peso y duración");
ok("1920×1080 mp4 de 60 s pasa", vid().ok);
ok("mov (iPhone) pasa", vid({ formato: "mov" }).ok);
ok("avi se rechaza", !vid({ formato: "avi" }).ok);
ok("120 s exactos pasan", vid({ duracion_s: 120 }).ok);
ok("121 s se rechaza", !vid({ duracion_s: 121 }).ok);
ok("duración desconocida se rechaza", !vid({ duracion_s: 0 }).ok);
ok("100 MB exactos pasan", vid({ bytes: P.MAX_BYTES_VIDEO }).ok);
ok("un byte de más se rechaza", !vid({ bytes: P.MAX_BYTES_VIDEO + 1 }).ok);
const vertical = vid({ ancho: 1080, alto: 1920 });
ok("un video vertical se rechaza…", !vertical.ok);
ok("…y pide grabar en horizontal", !vertical.ok && vertical.error.includes("horizontal"));
ok("1280×720 pasa", vid({ ancho: 1280, alto: 720 }).ok);
ok("426×240 se rechaza por pequeño", !vid({ ancho: 426, alto: 240 }).ok);

/* ── Carreras ──────────────────────────────────────────────────────────── */
console.log("\nrótulos de carrera — las dos reales del catálogo");
eq(P.rotuloCarrera("MECATRONICA", "MECATRONICA"), "MECATRÓNICA", "MECATRONICA → MECATRÓNICA");
eq(P.rotuloCarrera("RH", "RH"), "RECURSOS HUMANOS", "RH → RECURSOS HUMANOS");
eq(P.rotuloCarrera("rh", "RH"), "RECURSOS HUMANOS", "la clave se compara en mayúsculas");
eq(P.rotuloCarrera("ENFERMERIA", "Enfermería"), "Enfermería", "clave sin rótulo cae al nombre");
eq(P.rotuloCarrera("ENFERMERIA", ""), "ENFERMERIA", "…y si el nombre está vacío, a la clave");

/* ── Orden del carrusel ────────────────────────────────────────────────── */
console.log("\norden del carrusel");
eq(P.siguienteOrdenLibre([]), 1, "vacío → 1");
eq(P.siguienteOrdenLibre([1, 2, 4]), 3, "rellena el primer hueco");
eq(P.siguienteOrdenLibre([1, 2, 3, 4, 5]), null, "lleno → null");
const cinco = [1, 2, 3, 4, 5].map((o) => ({ id: `i${o}`, orden: o }));
eq(P.ordenTrasEliminar(cinco, "i2"), [{ id: "i1", orden: 1 }, { id: "i3", orden: 2 }, { id: "i4", orden: 3 }, { id: "i5", orden: 4 }], "eliminar compacta sin huecos");
eq(P.ordenTrasEliminar(cinco, "no-existe").length, 5, "eliminar algo que no está no cambia nada");
const copia = JSON.stringify(cinco);
P.ordenTrasEliminar(cinco, "i1");
ok("ordenTrasEliminar no muta la entrada", JSON.stringify(cinco) === copia);
ok("carrusel vacío: se puede subir a la 1", P.ordenPermitidoParaSubir([], 1));
ok("carrusel vacío: NO a la 5 (dejaría huecos)", !P.ordenPermitidoParaSubir([], 5));
ok("con 1 y 2: se puede reemplazar la 2", P.ordenPermitidoParaSubir([1, 2], 2));
ok("con 1 y 2: se puede añadir la 3", P.ordenPermitidoParaSubir([1, 2], 3));
ok("con 1 y 2: NO la 4", !P.ordenPermitidoParaSubir([1, 2], 4));
ok("lleno: se puede reemplazar cualquiera", P.ordenPermitidoParaSubir([1, 2, 3, 4, 5], 4));
ok("una permutación válida se acepta", P.esPermutacion(["b", "a", "c"], ["a", "b", "c"]));
ok("falta uno → no", !P.esPermutacion(["a", "b"], ["a", "b", "c"]));
ok("repetido → no", !P.esPermutacion(["a", "a", "b"], ["a", "b", "c"]));
ok("uno ajeno → no", !P.esPermutacion(["a", "b", "x"], ["a", "b", "c"]));

/* ── Destino de una subida ─────────────────────────────────────────────── */
console.log("\ndestino de una subida — reglas entre campos");
const MEC = "c250801e-36b2-40c1-8951-7f2b91874533";
ok("imagen de escritorio en la posición 3", P.validarDestino({ tipo: "imagen", variante: "escritorio", orden: 3 }).ok);
ok("imagen móvil en la posición 5", P.validarDestino({ tipo: "imagen", variante: "movil", orden: 5 }).ok);
ok("imagen sin variante → no", !P.validarDestino({ tipo: "imagen", orden: 1 }).ok);
ok("imagen en la posición 6 → no", !P.validarDestino({ tipo: "imagen", variante: "escritorio", orden: 6 }).ok);
ok("imagen en la posición 0 → no", !P.validarDestino({ tipo: "imagen", variante: "escritorio", orden: 0 }).ok);
ok("imagen en la posición 2,5 → no", !P.validarDestino({ tipo: "imagen", variante: "escritorio", orden: 2.5 }).ok);
ok("imagen ligada a una carrera → no", !P.validarDestino({ tipo: "imagen", variante: "escritorio", orden: 1, carreraId: MEC }).ok);
ok("video de una carrera", P.validarDestino({ tipo: "video", carreraId: MEC }).ok);
ok("video sin carrera → no", !P.validarDestino({ tipo: "video" }).ok);
ok("video con posición → no", !P.validarDestino({ tipo: "video", carreraId: MEC, orden: 1 }).ok);
ok("video con variante móvil → no", !P.validarDestino({ tipo: "video", carreraId: MEC, variante: "movil" }).ok);
ok("tipo inventado → no", !P.validarDestino({ tipo: "audio" }).ok);

/* ── Identificadores de Cloudinary ─────────────────────────────────────── */
console.log("\npublic_id de Cloudinary");
const idImg = P.publicIdNuevo("imagen", "escritorio", "3f2a9c1e-77aa");
eq(idImg, "cetac23/portada/imagen_escritorio_3f2a9c1e-77aa", "imagen de escritorio");
eq(P.publicIdNuevo("video", null, "abcdef12"), "cetac23/portada/video_abcdef12", "video");
eq(P.publicIdNuevo("imagen", "movil", "AB/../cd_ef-1234"), "cetac23/portada/imagen_movil_abcdef-1234", "el sufijo no puede colar una ruta");
let lanzo = false;
try { P.publicIdNuevo("imagen", "escritorio", "abc"); } catch { lanzo = true; }
ok("un sufijo demasiado corto lanza", lanzo);
ok("un id de portada se reconoce", P.esPublicIdDePortada(idImg));
ok("un id de otra carpeta NO", !P.esPublicIdDePortada("cetac23/noticia_inicio_1"));
ok("un id con ruta intercalada NO", !P.esPublicIdDePortada("cetac23/portada/../secreto_abcdefgh"));
const idVid = P.publicIdNuevo("video", null, "abcdef12");
ok("una imagen de escritorio corresponde a su tipo", P.publicIdCorrespondeA(idImg, "imagen", "escritorio"));
ok("un video NO puede registrarse como imagen", !P.publicIdCorrespondeA(idVid, "imagen", "escritorio"));
ok("una imagen de escritorio NO como móvil", !P.publicIdCorrespondeA(idImg, "imagen", "movil"));
ok("una imagen NO como video", !P.publicIdCorrespondeA(idImg, "video", null));

/* ── Ajustes de contacto ───────────────────────────────────────────────── */
console.log("\najustes — uno bueno y uno malo de cada");
ok("las 6 claves coinciden con el CHECK de la base", P.CLAVES_AJUSTE.length === 6);
const casos = [
  ["tiktok_url", "https://www.tiktok.com/@cetac23", "https://www.instagram.com/cetac23"],
  ["facebook_url", "https://www.facebook.com/cetac23", "http://www.facebook.com/cetac23"],
  ["whatsapp_numero", "442 123 4567", "12345"],
  ["correo", "contacto@cetac23.edu.mx", "contacto@"],
  ["telefono", "442 123 4567", "x".repeat(301)],
  ["direccion", "Avenida Villas de la Piedad", "x".repeat(301)],
];
for (const [clave, bueno, malo] of casos) {
  ok(`${clave}: «${bueno.slice(0, 28)}» pasa`, P.validarAjuste(clave, bueno).ok);
  ok(`${clave}: «${malo.slice(0, 28)}» se rechaza`, !P.validarAjuste(clave, malo).ok);
}
ok("un valor vacío es válido (quita el icono)", P.validarAjuste("tiktok_url", "  ").ok);
ok("una clave inventada se rechaza", !P.validarAjuste("instagram_url", "https://instagram.com/x").ok);
ok("un subdominio falso no engaña (tiktok.com.malo.mx)", !P.validarAjuste("tiktok_url", "https://tiktok.com.malo.mx/x").ok);
eq(P.enlaceWhatsApp("442 123 4567"), "https://wa.me/524421234567", "10 dígitos → se antepone 52 (México)");
eq(P.enlaceWhatsApp("+52 1 442 123 4567"), "https://wa.me/5214421234567", "con código de país se respeta");
eq(P.enlaceWhatsApp("123"), null, "demasiado corto → sin enlace");

console.log(`\nResultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
