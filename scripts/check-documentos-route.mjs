// Verifica si el dev server responde en /documentos y /profesor
const urls = [
  "http://localhost:3000/documentos",
  "http://localhost:3000/profesor",
  "http://localhost:3000/",
];

for (const url of urls) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, { signal: ctrl.signal, redirect: "manual" });
    clearTimeout(t);
    console.log(`${url} => STATUS ${r.status} ${r.statusText}`);
  } catch (e) {
    console.log(`${url} => ERROR: ${e.message}`);
  }
}
