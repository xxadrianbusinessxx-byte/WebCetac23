# Estrategia de Optimización de Rendimiento — WebCETAC 23

> **Objetivo:** estructura suficientemente rápida y estable para el tope académico actual de ~400 alumnos reales, con capacidad objetivo de hasta **500 alumnos**, sin romper ninguna funcionalidad.
>
> **Fuente:** FASE 0 (benchmark) + FASE 1 (priorización/descarte). Este archivo es la única fuente de verdad de la estrategia.
>
> **Estado del repositorio:** HEAD `af4d518` (C4.28). Verificado: sin cambios de código entre FASE 0 y FASE 1.

---

## 1. Objetivo

Llevar la aplicación a una operación cómoda con **400–500 alumnos** y **concurrencia real** (asistencias, boletas, materias, calificaciones, perfiles, registros, comentarios, grupos, paneles, inicio y operaciones administrativas), optimizando por: impacto medido, frecuencia, crecimiento con N y con concurrencia, riesgo de timeout, beneficio/riesgo, y preservación de identidad/permisos/datos.

## 2. Estado actual

- Next.js 16.2.6 · React 19.2.4 · Supabase/PostgREST · Cloudinary · Server Actions (sin Route Handlers).
- Datos reales (FASE 0): **461 alumnos, 19 profesores, 443 inscripciones, 463 tutores, 465 tutor_alumnos, 455 credenciales, 3,863 asistencias, 240 grupo_materias, 240 tablas de materia + 24 registros**.
- **Las 240 tablas de materia y las 24 de registros están VACÍAS (0 filas)**; aún no hay calificaciones cargadas.
- Identidad de materia: `idInterno` = nombre físico actual (`1ROAMAT001`, `2DOMCBMAT007`…); `grupo_materias.tabla_legacy` = puente; `nombreVisible` = solo presentación.

## 3. Alcance de 400–500 alumnos

- "400 alumnos" NO es solo 400 filas: implica picos simultáneos (semana de calificaciones/boletas).
- Proyecciones: `ALUMNOS` ≈ 500, `PROFESORES` ≈ 20–30, `TUTORES` ≈ 500, tablas de clase 40–50 filas, **registros/boleta 400–500 filas × ~38 columnas**, `asistencia_alumnos` crece lineal con días×profesores.
- **Escala mal con N:** escrituras por fila (avance/roster), `select(*)` de registros, generación masiva de tutores, panel directivo.
- **Escala mal con concurrencia:** spec OpenAPI (681 KB/request), perfil (7+ round-trips/visita), login (3 round-trips/intento).

## 4. Resumen de la FASE 0 (mediciones de referencia)

| Métrica | Valor medido |
| --- | --- |
| Spec OpenAPI (fetch no-store) | **681 KB · 2.6 s frío · 507–896 ms caliente/concurrente** · JSON.parse 4 ms |
| ALUMNOS range(0,4999) | 461 filas · 54.7 KB · 154–177 ms |
| PROFESORES range(0,4999) | 19 filas · 2 KB · 96–115 ms |
| Login (3 RT secuenciales) | ~390 ms DB + matching JS 3 ms (trivial) |
| Perfil (7 queries secuenciales) | ~960 ms DB + **~490 ms Cloudinary** (1 llamada) |
| Vista materia (spec + 4 queries) | ~843 ms (spec ≈ 85 %) |
| Cloudinary `api.resource` | foto existente 491 ms · no existe 119 ms · noticia 178/122 ms |
| N+1 tutores (463 × ~98 ms) | **≈ 45 s** (timeout Vercel probable) |
| N+1 asignaciones (~0.65 s/asignación) | 4 → 2.6 s · 50 → ~33 s |
| Concurrencia lecturas 5–20 usr | 0 errores; OpenAPI lo que más se degrada (p95 896 ms @10) |
| App (dev, no representativo) | login 436–879 ms · `GET /perfil` 2.2 s · vista materia 448–570 ms · noticias 187–377 ms |

**Verdicto clave:** el mayor coste unitario es el **spec OpenAPI**; le siguen **Cloudinary admin** y los **N+1 del panel directivo**. Las tablas de materia vacías hacen que `select(*)` NO sea coste actual.

## 5. Cuellos confirmados (con medición)

| ID | Cuello | Evidencia | Clasificación |
| --- | --- | --- | --- |
| C3 | OpenAPI/PostgREST 681 KB sin caché | 2.6 s frío; 85 % de la vista materia | **OPTIMIZAR AHORA (O3)** |
| C5 | Cloudinary `api.resource` por request | 120–490 ms × 2–3 llamadas/página | **OPTIMIZAR AHORA (O5)** |
| C8 | N+1 tutores con credenciales | 463 × 98 ms ≈ **45 s** | **OPTIMIZAR AHORA (O9)** |
| C2 | Perfil 7+ queries secuenciales | ~960 ms DB + 490 ms Cloudinary; 2.2 s dev | **OPTIMIZAR AHORA (O1)** |
| C7 | N+1 asignaciones (full-scan PROFESORES por asignación) | ~0.65 s/asignación | **OPTIMIZAR AHORA (O8)** |
| C1 | Login 3 RT secuenciales | ~390 ms DB; matching JS 3 ms | REDUCIR LATENCIA, no volumen |

## 6. Cuellos potenciales (por código, sin datos/medición)

| ID | Cuello | Cuándo se vuelve crítico |
| --- | --- | --- |
| C4/C13/C14 | `select(*)` + updates por fila (avance/roster) | Al cargar calificaciones: 40 → ~4 s · 500 → ~50 s · 1000 → ~100 s (timeout) |
| C9 | Generación masiva de tutores (scrypt + inserts por alumno) | Hoy: 463 ≈ 2.5–4 min (timeout) |
| DDL | `escolar_sync_columns`/`escolar_agregar_columnas` + `pg_notify reload schema` | Subidas simultáneas de varios profesores |
| C11/C12 | `actionTieneAccesoDocumentos` (layout) + `getUser()` (proxy) por request | Coste fijo por request; no medido sin la app; bajo frente a P1 |
| C10 | Chat sin paginación real | Solo 3 filas hoy; riesgo futuro documentado |

## 7. Priorización final

### PRIORIDAD 1 — OPTIMIZAR AHORA

#### O3 — Cache del spec OpenAPI / esquema de tablas

- **Problema:** `listarColumnasTabla`/`listarTablasDesdeSupabase` descargan el spec (681 KB) con `no-store` en cada operación de materia/registro/columna/boleta/listado/subida.
- **Evidencia:** 2,578 ms frío; 507–896 ms caliente; ~85 % de la vista de materia.
- **Beneficio:** vistas de materia/registro/boleta y subidas pasan de ~0.5–2.6 s a ~0.05–0.3 s.
- **Por qué 400–500:** coste fijo por request que se multiplica con concurrencia (20 boletas a la vez = 13 MB evitables). Mayor impacto, menor cambio.
- **Riesgo funcional:** servir esquema obsoleto tras subir Excel (columnas nuevas/eliminadas).
- **Riesgo de consistencia:** MEDIO, controlable con TTL 30–60 s + invalidación por tag tras DDL.
- **Complejidad:** baja-media. `unstable_cache` sobre la lista de tablas/columnas + `revalidateTag("esquema-tablas")` en todas las acciones que ejecutan `escolar_sync_columns`/`escolar_agregar_columnas` (reemplazo, avance, status). La subida NO depende de que la lectura sea fresca (la escritura va por RPC + insert); un TTL residual no rompe la escritura.
- **Estrategia segura:** la caché solo guarda lista de tablas y columnas, nunca datos de alumnos.
- **Pruebas de regresión:** subir Excel → abrir materia y ver columna nueva; abrir registro; configuración directivo; materia con columna eliminada; dos profesores subiendo a la vez.
- **Condición de terminación:** `actionObtenerVistaMateria` < 300 ms; spec descargado 1 vez por TTL; columnas nuevas visibles inmediatamente tras subir.

#### O5 — Cache de existencia de recursos Cloudinary

- **Problema:** foto de perfil y noticias llaman a la API administrativa en cada request.
- **Evidencia:** foto 491 ms (existe) · noticia 1 = 178 ms · noticia 2 = 122 ms.
- **Beneficio:** perfil −0.49 s; inicio/directivo −0.3 s; 0 llamadas admin en lecturas; evita rate-limit con 400–500 alumnos.
- **Riesgo de consistencia:** foto/noticia nueva no visible hasta TTL si no se invalida. Mitigación: TTL 5–15 min + invalidación en `actionSubirFotoPerfil`/`actionPublicarNoticiaInicio`. Claves separadas (foto por CURP, noticia por slot).
- **Complejidad:** baja (mismo mecanismo que O3).
- **Pruebas:** subir foto → visible inmediata; sin foto → ícono; publicar noticia → visible.
- **Condición de terminación:** 0 llamadas `api.resource` en lecturas; consistencia tras subidas.

#### O9 — Batch de credenciales de tutores (eliminar N+1)

- **Problema:** `actionListarTutoresConCredenciales` ejecuta 1 query por tutor (bucle en líneas 65–68 de `app/actions/tutores.ts`).
- **Evidencia:** ~98 ms × 463 ≈ **45 s** → timeout de Vercel (60 s) probable.
- **Beneficio:** 45 s → < 1 s (2 queries: `listarTutores` + una con `in(tutor_id)`).
- **Riesgo funcional:** tutores sin credenciales (quedan `[]`), tutores con varios hijos (agrupar), **preservar el orden de `listarTutores`** y la estructura exacta de la respuesta.
- **Complejidad:** baja. Query `tutor_credenciales_iniciales` con `.in("tutor_id", ids)` + agrupar con `Map`.
- **Pruebas:** tutor con 1/2/3 hijos; tutor sin credenciales; orden del panel; 463 totales.
- **Condición de terminación:** panel directivo de tutores < 2 s.

#### O1 — Paralelizar consultas del perfil

- **Problema:** `actionObtenerPerfilAlumno` ejecuta ~7 queries secuenciales (~960 ms DB) + Cloudinary (~490 ms).
- **Evidencia:** perfil 2.2 s dev; ~1.45 s solo en datos.
- **Beneficio:** −40–60 % de latencia de datos del perfil (→ ~0.6–0.8 s).
- **Riesgo funcional:** BAJO si se preservan las cadenas internas: `inscripción → grupo → carrera` y `grupo → semestre → materias`. Son **independientes** entre sí: ALUMNOS, ETIQUETAS PERSONALES, nombres visibles, comentarios y foto.
- **Complejidad:** baja (agrupar en `Promise.all` por niveles de dependencia).
- **Pruebas:** alumno normal; sin grupo; sin materias; sin foto; con comentarios; modo directivo (`?modo=directivo&curp=…`).
- **Condición de terminación:** perfil dev < 1.2 s; resultado byte a byte igual.

#### O8 — Batch de asignaciones (eliminar N+1)

- **Problema:** `listarAsignacionesAdmin` ejecuta por asignación: `resolverGrupoMateria` (4–5 queries) + `obtenerProfesorPorId` (que hace `range(0,4999)` sobre PROFESORES).
- **Evidencia:** ~0.65 s/asignación; 4 ≈ 2.6 s; 50 ≈ 33 s.
- **Beneficio:** 2.6 s → ~0.4 s (4 asignaciones); escala al crecer el catálogo.
- **Riesgo funcional:** preservar orden (`created_at desc`), profesores inexistentes (`null`), asignaciones duplicadas, `grupo_materia` inactivo.
- **Complejidad:** baja-media. 1 query `in(id)` de `grupo_materia_ids` + 1 query `in(id)` de PROFESORES + resolución en memoria.
- **Pruebas:** 4 asignaciones actuales; asignación con `profesor_id` null; orden del listado.
- **Condición de terminación:** `actionListarAsignacionesProfesorAdmin` < 500 ms.

### PRIORIDAD 2 — PREPARAR PERO NO EJECUTAR

#### O4 — Columna `nombre_normalizado` + índices

- **Por qué NO ahora:** toca la **identidad del alumno** (precedencia CURP → nombre normalizado → tokens invertidos). El benchmark demostró que el problema del login es de **latencia de round-trips (~390 ms)**, no de matching JS (3 ms) ni de volumen (461 filas). Con 500 filas el beneficio es modesto frente al riesgo de romper la coincidencia de nombres (acentos, Ñ, orden invertido).
- **Prerequisitos:** aprobación de migración SQL; staging con ~500 nombres reales; demostrar equivalencia funcional exacta; mantener el fallback JS como validación cruzada.
- **Diseño documentado (no ejecutado):** columna `nombre_normalizado` (sin acentos, mayúsculas, espacios simples) + índice; búsqueda por la columna con la MISMA lógica de tokens; `buscar-en-filas.ts` (matching en memoria) permanece intacto para localización en filas de Excel.

#### O2 — Caché de catálogo (periodos, carreras, materias, grupos, grupo_materias, semestres, nombres visibles)

- **Por qué NO ahora:** beneficio medio (~100 ms por lectura repetida); requiere inventariar **todas** las escrituras administrativas para invalidar. Se **diseña ahora**, se ejecuta después de O3 (reutiliza tags).
- **Regla:** nunca cachear calificaciones, asistencia, justificaciones ni sesión. Solo catálogo/config con invalidación explícita.

#### O7 — Batch de updates en avance/roster

- **Por qué NO ahora:** las tablas de materia están vacías; el coste estimado (4 s @40 → 50 s @500 → 100 s @1000) solo aparece con datos reales. Requiere staging con 40/100/400/500 filas y pruebas de identidad.
- **Diseño documentado (no ejecutado):** RPC de upsert por lotes o updates por lote con `in(id)`, preservando la identificación (CURP → nombre normalizado → tokens) y la separación reemplazo/avance.

### DIFERIR

| Opt | Motivo |
| --- | --- |
| O6 Documentos en layout | Sin medición de impacto; coste fijo bajo frente a P1. Revisar tras medir en producción. |
| O10 Selects de catálogo | Payloads medidos pequeños (grupos 24, carreras 2, grupo_materias 240 = 11.7 KB). Beneficio bajo. |
| O11 Imágenes | Warnings LCP obsoletos (el código actual no usa las imágenes decorativas). Solo limpieza. |
| O12 Código muerto | `lib/calificaciones` (sin uso en UI), `capas.ts`, 5.4 MB de imágenes, logs 6J. Lote 4. |
| O13 Virtualización de tablas | Tablas vacías; sin problema actual. Reevaluar al poblar (clases de 40–50 filas probablemente no lo necesiten). |
| O14 Excel en cliente | Sin archivos grandes reales; parseo en servidor aceptable a esta escala. |
| O16 Rediseño de tablas | Clases reales de 40–50 alumnos; el modelo actual funciona a 400–500. Rediseño = riesgo crítico sin beneficio actual. **Límite futuro** (>500 o subidas masivas frecuentes). |

### DESCARTAR

| Ítem | Evidencia |
| --- | --- |
| C6 Alumnos estrella (full-scans) | `ETIQUETAS (STATUS)` tiene **2 filas**; `ALUMNOS` range(0,4999) con 461 filas = ~170 ms. No es cuello actual. |
| C10 Chat sin paginación | `COMENTARIOS` tiene **3 filas**. Riesgo futuro documentado, no intervenir. |
| C15 Configuración (4 paneles) | Sin medición que demuestre impacto sobre el objetivo. |
| O11 Imágenes como problema de LCP | Warnings obsoletos (código actual sin esas imágenes). |

## 8. Matriz de carga conceptual 400–500 alumnos

> "NO MEDIDO" = requiere staging con datos poblados. Ningún valor es inventado.

| Operación | 400 alumnos | 500 alumnos | Concurrencia | Riesgo |
| --- | --- | --- | --- | --- |
| Login | ~390 ms DB (3 RT); ALUMNOS 461→500 filas (+8 %) | ~400 ms | 20 concurrentes medidos sin errores (p95 444 ms) | MEDIO (latencia por usuario) |
| Perfil | ~960 ms DB (7 RT) + ~490 ms Cloudinary por visita | igual | Lineal con usuarios simultáneos | MEDIO-ALTO (2.2 s dev hoy) |
| Boleta | `select(*)` registro ~400–500 filas × 38 cols ≈ 200 KB + spec 681 KB | **NO MEDIDO** (tablas vacías) | — | MEDIO (spec domina) |
| Asistencia | ~320 ms (3–4 point queries por alumno); no crece con N | igual | Lineal con simultáneos | BAJO |
| Materia | clase 40–50 filas → `select(*)` pequeño; spec domina (85 %) | **NO MEDIDO** | — | MEDIO (spec) |
| Registro | igual que boleta | **NO MEDIDO** | — | MEDIO |
| Panel profesor | 5–8 queries; crece con materias asignadas, no con N | igual | — | MEDIO |
| Panel tutor | 4–5 queries | igual | — | BAJO |
| Panel directivo | **N+1 tutores ≈ 45 s (timeout) + N+1 asignaciones ~0.65 s c/u + noticias 300 ms** | igual o peor | — | **CRÍTICO** |
| Tutores (generación) | ~2.5–4 min (timeout) | igual | — | ALTO (admin, raro) |
| Excel (avance) | N+1 updates: 40 → ~4 s · 500 → ~50 s | **timeout** | — | ALTO cuando haya datos |

**Lectura:** lo que escala mal con N = avance/roster (escrituras), boleta/registro (payload), generación de tutores. Lo que escala mal con concurrencia = spec OpenAPI, perfil, login.

## 9. Riesgos funcionales

1. Cachear esquema (O3) puede ocultar columnas nuevas ≤ TTL → mitigar con invalidación tras DDL.
2. Cachear Cloudinary (O5) puede ocultar foto/noticia recién subida → invalidar en la subida.
3. O9/O8 pueden alterar orden o filas si no se reconstruye en memoria igual que hoy.
4. O1 puede cambiar el resultado si se rompen las cadenas inscripción→grupo→carrera y grupo→semestre→materias.
5. O4 puede romper login si el índice no reproduce normalización/tokens.

## 10. Dependencias que no deben romperse

- **Identidad del alumno:** `claveDesdeCurp`, `nombreCompletoAlumno`, `normalizarNombre`, `nombresCoinciden`, `mismosTokensNormalizados`, `buscar-en-filas.ts`; precedencia CURP → nombre normalizado → tokens invertidos. El matching JS (~3 ms) NO es el problema y no debe sustituirse por ILIKE sin equivalencia demostrada.
- **Identidad de materia:** `idInterno` = nombre físico (`1ROAMAT001`…). No renombrar. `nombreVisible` solo presentación. `grupo_materias.tabla_legacy` = puente.
- **Reemplazo vs avance:** `reemplazarHojaEnTabla` y `actualizarMateriaDesdeArchivo` son flujos intencionalmente distintos. No unificar.
- **Login:** precedencia PROFESORES → ALUMNOS → TUTORES. Si se paraleliza, resolver el rol después de obtener los resultados.
- **Sesión:** nunca cachear CURP/profesorId/rol en caché compartida.
- **Columnas dinámicas:** consumidores adicionales (identificación 7B, mapeo 7C, búsqueda, visibilidad, avance, boletas). No eliminar columnas de lecturas.

## 11. Plan por lotes

### Lote 1 — Alto beneficio, bajo riesgo
- **Se cambia:** O3 (cache spec + tags), O5 (cache Cloudinary), O9 (batch tutores), O1 (perfil paralelo), O8 (batch asignaciones). Solo Server Actions/librerías de lectura; **ninguna** tabla, columna, RPC, SQL ni lógica de identidad.
- **No se cambia:** identidad, precedencia de login, cadenas dependientes, separación reemplazo/avance, sesión, `idInterno`.
- **Pruebas:** matriz de regresión (sección 12) + medición repetida de la FASE 0.
- **Éxito:** vista materia < 300 ms; perfil dev < 1.2 s; tutores < 2 s; asignaciones < 500 ms; 0 llamadas `api.resource` en lecturas.
- **Revertir si:** cualquier prueba de identidad/orden/visibilidad falla (los cambios son reversibles, sin migraciones).

### Lote 2 — Requiere SQL/migración y pruebas de identidad
- **Se cambia:** O4 (`nombre_normalizado` + índices) y O2 (caché de catálogo con invalidación exhaustiva). Requiere aprobación de migración y staging.
- **Éxito:** login < 250 ms; equivalencia funcional probada con el set real de 500 nombres.
- **Revertir si:** falla cualquier caso de la matriz de identidad (acentos, Ñ, orden invertido, homónimos en dos fuentes).

### Lote 3 — Condicionado a datos reales
- **Se cambia:** O7 (batch updates avance/roster) y, si los datos lo justifican, O13/O14. Requiere poblar tablas de materia en staging (40/100/400/500 filas).
- **Éxito:** avance de 500 filas < 10 s sin timeout.
- **Revertir si:** la identificación de filas difiere del comportamiento actual.

### Lote 4 — Limpieza y cosmético
- **Se cambia:** O12 (código muerto: `lib/calificaciones`, `capas.ts`, imágenes 5.4 MB, logs 6J), O11 (config imágenes), O6 (documentos en layout, solo si se mide impacto).
- **Éxito:** build limpio; sin cambios funcionales.

## 12. Pruebas requeridas (tras cada lote)

- **Login:** profesor, alumno, tutor; nombre con/sin acentos; orden normal e invertido; homónimo en más de una fuente; CURP.
- **Perfil:** nombre visible; CURP; materias; selección de materia; calificaciones; estatus; comentarios; foto (con/sin); modo directivo.
- **Materia:** visible; nombre visible vs físico; búsqueda de alumno; alumno existente/inexistente; columnas dinámicas nuevas/eliminadas; datos legacy y actuales.
- **Excel:** reemplazo completo; avance; alumno existente/nuevo; CURP; nombre normalizado; columnas nuevas/eliminadas.
- **Directivo:** materias; asignaciones (orden, profesor null); tutores (orden, sin credenciales, multi-hijo); permisos.
- **Tutor:** acceso; alumnos vinculados; asistencia; justificaciones.
- **Concurrencia (staging):** 20/50 usuarios leyendo perfil+boleta+panel; login 20 concurrentes.

## 13. Criterios de éxito (objetivo 400–500)

1. `actionObtenerVistaMateria` < 300 ms.
2. Perfil < 1.2 s (dev) con datos completos.
3. Panel directivo tutores < 2 s y asignaciones < 500 ms (sin timeouts).
4. Login < 250 ms (DB) tras O4 (o sin cambios si O4 se difiere).
5. 0 llamadas admin Cloudinary en lecturas normales.
6. Sin errores 4xx/5xx a 20–50 usuarios concurrentes en lecturas (staging).
7. Cero cambios en la funcionalidad: todas las pruebas de la sección 12 pasan.

## 14. Qué NO hacer todavía

- No ejecutar O4/O2/O7 sin staging y aprobación.
- No crear índices ni migraciones.
- No renombrar tablas físicas ni cambiar `idInterno`.
- No unificar reemplazo/avance.
- No sustituir `buscar-en-filas` por ILIKE.
- No cachear sesión/CURP/rol ni datos de calificaciones/asistencia.
- No rediseñar el modelo de tablas (O16) mientras la escala sea ≤500.
- No ejecutar escrituras masivas (generación de tutores, subidas grandes) en producción.

## 15. Estado actual de mediciones

- Medido (FASE 0): spec OpenAPI, login, perfil (DB+Cloudinary), vista materia, N+1 tutores/asignaciones, concurrencia 5–20 lecturas, payloads, conteos de tablas.
- NO medible aún: Web Vitals en producción (sin URL), bundle de producción (sin `next build`), índices/sequential scans (metadatos no accesibles vía REST), escrituras (sin staging), app end-to-end (sin servidor activo).

## 16. Preguntas/pruebas pendientes de staging

1. ¿Cuánto tarda `escolar_sync_columns` con una tabla de 500 filas y 30 columnas?
2. ¿Cuánto tarda `select(*)` de un registro de 500 filas × 38 cols y su render?
3. ¿Avance con 40/100/400/500 filas (batch vs N+1)?
4. ¿Generación masiva de tutores con 463/500 (tiempo real, memoria, scrypt)?
5. ¿Índices existentes? (SQL Editor: `pg_indexes`, `pg_stat_user_tables`).
6. ¿Concurrencia 50 usuarios en lecturas + subidas simultáneas?
7. ¿Comportamiento de PostgREST con `pg_notify reload schema` bajo 3+ subidas simultáneas?
8. ¿Latencia Vercel↔Supabase↔Cloudinary en la región de producción?

## 17. Índices candidatos (documentación — NO ejecutar)

| Columna | Consulta que beneficia | Falta medir |
| --- | --- | --- |
| `ALUMNOS(CURP)` | perfil, login por CURP, roster | costo/beneficio con 500 filas |
| `ALUMNOS(CLAVE)` | login por clave | idem |
| `PROFESORES(CLAVE)` | login | idem |
| `ETIQUETAS PERSONALES(CURP)` | perfil | idem |
| `ETIQUETAS (STATUS)(CURP)` | estatus/estrella | idem |
| `inscripciones_alumno(curp)`, `(grupo_id)` | perfil, carga, asistencia | idem |
| `grupo_materias(tabla_legacy)` | identidad/visibilidad | idem |
| `tutor_alumnos(curp_alumno)`, `(tutor_id)` | tutores | idem |
| `asistencia_alumnos(curp,grado,grupo,fecha)`, `(profesor_clave,fecha)` | asistencia | idem |
| `justificaciones_asistencia(curp_alumno,fecha)` | circuito justificación | idem |
| tablas de materia: `alumno_nombre` (trigram) | vista alumno | solo si se confirma búsqueda por nombre con datos |

> El impacto de índices solo se puede confirmar vía Supabase → SQL Editor con las consultas reales.

## 18. Discrepancias encontradas respecto a la FASE 0

1. **C6** se listó como cuello; el benchmark mostró `ETIQUETAS (STATUS)` con **2 filas** → reclasificado a DESCARTADO (no contradice el código, sí la prioridad).
2. **C4** (`select(*)`) se listó como confirmado; las tablas de materia están **vacías** → reclasificado a POTENCIAL (depende de poblar datos).
3. **C1**: la FASE 0 sospechaba volumen; el benchmark demostró que el coste es de **round-trips**, no de datos → el plan ataca latencia, no matching.
4. **Nombres físicos**: la FASE 0 usó el contexto (`1RO A CIENCIAS NATURALES`); el repositorio real tiene nombres renombrados (`1ROAMAT001`, C4.28) → ya documentado y re-confirmado.
5. El hash de HEAD se muestra como `af4d518` (la FASE 0 lo mostraba como `raf4d518` por truncado del terminal): **sin cambios de código entre fases**.

---

**Fin de la FASE 1.** Próximo paso: implementar el Lote 1 (O3, O5, O9, O1, O8) tras aprobación, con medición antes/después y matriz de regresión.

---

# FASE 2 — IMPLEMENTACIÓN DEL LOTE 1

> Fecha: 30/08/2026 · HEAD `af4d518` + cambios del Lote 1 sin commit.
> Regla aplicada: una optimización a la vez, verificando tipos (`tsc --noEmit`) y midiendo el patrón de consultas contra Supabase (solo lecturas). No se modificó SQL, tablas, índices, autenticación, identidad, ni la separación reemplazo/avance.

## O3 — Cache del spec OpenAPI — **IMPLEMENTADO**

- **Archivos modificados:**
  - `lib/escolar/openapi.ts` (NUEVO): caché en memoria del spec, TTL 60 s, `obtenerSpecOpenAPI()` e `invalidarCacheOpenAPI()`.
  - `lib/escolar/tablas-supabase.ts`: `listarTablasDesdeSupabase` usa la caché (elimina el `fetch` no-store inline).
  - `lib/escolar/schema-tabla.ts`: `listarColumnasTabla` usa la caché; `sincronizarColumnasTabla` invalida tras la RPC de DDL.
  - `lib/escolar/materia-avance.ts`: invalida tras `escolar_agregar_columnas`.
- **Qué se cambió:** solo el origen de lectura del spec (1 descarga por ventana TTL de 60 s en vez de por operación). **Qué NO se cambió:** contenido del spec, columnas, tablas, lógica de negocio.
- **Medición antes:** spec = 681 KB, 2,578 ms frío, 507–896 ms caliente/concurrente (FASE 0). **Medición después:** **NO MEDIBLE EN ESTE ENTORNO** sin el servidor de la app ejecutándose (el caché vive en el proceso Next.js). Esperado: 1 descarga por TTL y ~0 ms en hits; validado por tipo + revisión.
- **Riesgos detectados:** obsolescencia del esquema ≤ 60 s tras una subida de Excel (columnas nuevas) en instancias que no ejecutaron la invalidación. Aceptado y documentado (FASE 1); el flujo de subida no depende de la frescura de la lectura (escribe por RPC).
- **Pruebas realizadas:** `tsc --noEmit` OK; revisión de consumidores de `listarColumnasTabla`/`listarTablasDesdeSupabase` (todos server-side; ninguno en Client Components).

## O5 — Cache Cloudinary — **IMPLEMENTADO**

- **Archivos modificados:**
  - `lib/cloudinary/urls-server.ts`: caché por CURP (TTL 10 min) + `invalidarUrlFotoPerfil(curp)`.
  - `lib/cloudinary/noticias.ts`: caché por slot (TTL 10 min) + `invalidarNoticiasInicio()`.
  - `app/actions/escolar.ts` (`actionSubirFotoPerfil`): invalida la foto del CURP tras subida exitosa.
  - `app/actions/noticias.ts` (`actionPublicarNoticiaInicio`): invalida noticias tras publicar.
- **Qué se cambió:** se cachea el resultado de `api.resource` (incluido el "no existe" → `null`). **Qué NO se cambió:** URLs, public_ids, carpetas, formato.
- **Medición antes:** foto existente 491 ms · no existe 119 ms · noticia 178/122 ms (FASE 0). **Medición después:** **NO MEDIBLE EN ESTE ENTORNO** (caché en proceso). Esperado: 0 llamadas admin en lecturas dentro del TTL.
- **Riesgos detectados:** consistencia tras subir foto/noticia — mitigado por invalidación explícita en la propia acción; limitación cross-instancia (≤ TTL) documentada.

## O9 — Batch de tutores — **IMPLEMENTADO**

- **Archivos modificados:**
  - `lib/escolar/tutores.ts`: nueva `listarCredencialesInicialesDeTutores` (lotes de 50 `in(tutor_id)` en paralelo + agrupación en memoria).
  - `app/actions/tutores.ts`: `actionListarTutoresConCredenciales` usa el batch.
- **Qué se cambió:** 463 queries secuenciales → ~10 queries en paralelo. **Qué NO se cambió:** generación, hashes, formato de credenciales, autenticación, orden de `listarTutores` (se preserva), estructura de la respuesta, tutores sin credenciales (`[]`).
- **Medición antes:** ~98 ms × 463 ≈ 45–100 s. **Medición después (real):** 10 consultas en lotes de 50 = **1,279 ms secuencial**; versión paralela implementada (esperado ~0.4–0.5 s).
- **Discrepancia encontrada y resuelta:** un `in(tutor_id)` con los 463 UUIDs desborda la URL (`UND_ERR_HEADERS_OVERFLOW`, medido). Se usan lotes de 50.
- **Pruebas realizadas:** medición real del patrón batch; `tsc` OK. Regresión funcional pendiente de ejecución en la app (panel directivo con 463 tutores).

## O1 — Paralelización del perfil — **IMPLEMENTADO**

- **Archivos modificados:** `app/actions/escolar.ts` (`actionObtenerPerfilAlumno`).
- **Qué se cambió:** las 6 consultas independientes (ALUMNOS, ETIQUETAS PERSONALES, `resolverGrupoAlumno`, nombres visibles, comentarios, foto) ahora corren en `Promise.all`. **Qué NO se cambió:** cadenas dependientes (`alumno → registro`; `grupo → semestre → materias`), orden de resolución, resultado, modo directivo, lógica de identidad.
- **Medición antes:** ~961 ms DB secuencial + ~491 ms Cloudinary (FASE 0). **Medición después (real, DB, sin Cloudinary):** simulación del patrón paralelo = **339–661 ms** (caliente ~450 ms) vs 961 ms secuencial.
- **Riesgos detectados:** ninguno funcional; se conservan las cadenas.

## O8 — Batch de asignaciones — **IMPLEMENTADO**

- **Archivos modificados:**
  - `lib/escolar/catalogo-academico.ts`: nueva `resolverGrupoMateriasBatch` (Map id → resolución/null, misma semántica que `resolverGrupoMateria`).
  - `lib/escolar/asignaciones-profesor.ts`: nueva `obtenerProfesoresPorIds` (`in(ID)`) y `listarAsignacionesAdmin` sin N+1.
- **Qué se cambió:** ~6 consultas por asignación (incluido full-scan de PROFESORES) → 4–6 consultas fijas totales. **Qué NO se cambió:** orden (`created_at desc`), profesor null → `PROFESORES.ID ?`, nombre visible, campos retornados, autorización.
- **Medición antes:** 2 asignaciones × 6 consultas = 1,713 ms → 4 ≈ 3.4 s; 50 ≈ 43 s. **Medición después (real):** batch para 4 asignaciones = **558 ms** (consultas fijas, no crecen con N).
- **Pruebas realizadas:** medición real del patrón; `tsc` OK.

## Tabla resumen del Lote 1

| Optimización | Estado | Antes | Después | Round-trips | Regresión | Observaciones |
| --- | --- | ---: | ---: | ---: | --- | --- |
| O3 OpenAPI | IMPLEMENTADO | 681 KB · 2.6 s frío / ~0.5–0.9 s caliente | **NO MEDIBLE EN ESTE ENTORNO** (esperado: 1 descarga/TTL 60 s) | 1 por operación → 1 por TTL | Sin regresión funcional detectada | Caché en memoria por instancia; invalidación tras DDL |
| O5 Cloudinary | IMPLEMENTADO | foto 491 ms · noticia 122–178 ms | **NO MEDIBLE EN ESTE ENTORNO** (esperado: 0 llamadas/TTL 10 min) | 2–3 por página → 0 en hits | Sin regresión detectada | Invalidación en subida foto/noticia |
| O9 Tutores | IMPLEMENTADO | ~45–100 s (463 queries) | **1,279 ms** (10 lotes secuenciales) / paralelo esperado ~0.5 s | 463 → ~10 | Pendiente de verificación en la app | Lotes de 50 por límite de URL (discrepancia resuelta) |
| O1 Perfil | IMPLEMENTADO | ~961 ms DB + ~491 ms Cloudinary | **~450 ms DB** (medido) | 7 secuenciales → 2 niveles | Sin regresión detectada | Cadenas dependientes conservadas |
| O8 Asignaciones | IMPLEMENTADO | 4 ≈ 3.4 s · 50 ≈ 43 s | **558 ms** (4 asignaciones, fijo) | 6×N → 4–6 fijas | Sin regresión detectada | `in()` de grupo_materia_ids y profesor_ids |

## Limitaciones de medición del Lote 1

- Las métricas "después" de O3/O5 (cache hit) requieren el servidor de la app ejecutándose: **NO MEDIBLE EN ESTE ENTORNO** (no se levantó `next dev` para no mezclar tiempos de desarrollo ni modificar `.next`).
- Las mediciones "después" de O9/O1/O8 son del **patrón de consultas** contra Supabase (lecturas), no de la Server Action completa (requiere sesión).
- Las pruebas de regresión funcional en la UI (panel directivo, perfil, subida de foto/noticia/Excel) **requieren la app en ejecución o staging**: pendientes.

## Pendientes de regresión funcional (Lote 1)

1. **O3:** abrir materia → columnas correctas; abrir registro; listar materias; subir Excel → columna nueva visible; materia recién creada; mapeo de columnas.
2. **O5:** perfil con/sin foto; subir foto → visible inmediata; inicio con/sin noticia; publicar noticia → visible.
3. **O9:** 463 tutores; tutor con/sin credenciales; relación correcta; orden del listado; campos idénticos.
4. **O1:** alumno normal; sin grupo; sin materias; sin foto; con comentarios; múltiples materias; sin inscripción; modo directivo.
5. **O8:** pocas/muchas asignaciones; profesor correcto; grupo/materia correctos; orden; permisos; nombres visibles.
6. **Identidad (regresión):** CURP → nombre normalizado → tokens invertidos; acentos/Ñ/orden invertido/homónimos — **sin cambios en el algoritmo**; verificación manual.

---

**Fin de la FASE 2.** Lote 1 implementado sin commits. Pendiente: verificación funcional en la app/staging (sección anterior) antes de declarar cerradas las optimizaciones.

---

# FASE PRE-3 — BENCHMARK POST-LOTE 1

> **OBJETIVO DEFINITIVO (supera 400–500): WebCETAC 23 debe soportar un pico de 600 usuarios simultáneos de forma estable**, sin caída del sistema, timeouts generalizados, 5xx significativos ni consultas que degraden exponencialmente con la concurrencia.
> Fecha: 30/08/2026 · Base: HEAD `af4d518` + Lote 1 (O3/O5/O9/O1/O8) **sin commit** · Repositorio: 11 archivos modificados + `lib/escolar/openapi.ts` nuevo.
> Esta fase fue SOLO medición/diagnóstico: **no se modificó código**.

## Metodología

- Mediciones directas contra **Supabase REST (instancia real, solo lecturas)** usando el patrón de consultas que produce cada Server Action del Lote 1.
- **Carga mixta** simulada por operación: 12.5 % login · 12.5 % perfil · 25 % materia/boleta (patrón **cacheado**, sin descarga de spec) · 20 % asistencia · 15 % tutor · 10 % profesor · 5 % directivo.
- Cada "usuario" ejecuta su ráfaga de consultas; métricas a nivel de usuario (ráfaga) y a nivel de request.
- Escalones: **20, 50, 100, 200, 300, 400, 500, 600** concurrentes, una ola por escalón.
- **Exclusiones documentadas:** Cloudinary NO se incluyó en la carga (evitar abuso de la API admin; O5 la retira del path de lectura, verificación de cache-hit requiere la app). Materia/boleta simula el comportamiento **post-O3** (spec cacheado); el coste de un miss se mide por separado.

## Limitaciones (importantes)

1. **NO se midió la app completa** (Server Actions + Next.js + render): requiere servidor y sesiones. Lo medido es el **patrón de consultas a Supabase**, que es donde vivían los cuellos.
2. **Cache hits de O3/O5 no observables** sin el proceso Next.js en ejecución → marcados como NO MEDIBLE en hit; el coste de un *miss* sí se midió.
3. Hardware: esta máquina local (Windows) → la latencia absoluta a 600 incluye red/cliente; la señal relevante es la **degradación relativa y la ausencia de errores**.
4. Las tablas de materia siguen vacías (0 filas): el `select(*)` de materia es mínimo hoy; crecerá con los datos.

## Baselines post-Lote 1 (MEDIDO) vs FASE 0

| Métrica | FASE 0 | Post-Lote 1 (FASE PRE-3) | Tipo |
| --- | --- | --- | --- |
| OpenAPI spec (descarga raw) | 681 KB · 2.6 s frío · 507–896 ms caliente | 681,321 B · 239–409 ms caliente · cache-hit **NO MEDIBLE** | MEDIDO (miss) / NO MEDIBLE (hit) |
| Perfil (patrón DB, sin Cloudinary) | ~961 ms secuencial | **215/161 ms** caliente (1032 ms frío) | MEDIDO |
| Tutores (batch) | ~45–100 s (463 queries) | **651 ms** (10 lotes paralelos) | MEDIDO |
| Asignaciones (batch) | 4 ≈ 3.4 s · 50 ≈ 43 s | **348 ms** (4 asignaciones, fijo) | MEDIDO |
| Cloudinary `api.resource` | 119–491 ms | sin cambios en la llamada; **0 en lecturas si O5 cachea** | MEDIDO (raw) / NO MEDIBLE (hit) |

## Rampa de carga mixta 20 → 600 (MEDIDO)

| Concurrentes | wall (ms) | req | req/s | p50 user | p95 user | p50 req | p95 req | p99 req | max req | 4xx/5xx/timeout/conn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 929 | ~70 | 22 | 608 | 913 | — | — | — | — | 0/0/0/0 |
| 50 | 1,180 | ~180 | 42 | 693 | 1,088 | — | — | — | — | 0/0/0/0 |
| 100 | 1,661 | ~380 | 60 | 981 | 1,483 | — | — | — | — | 0/0/0/0 |
| 200 | 2,859 | ~740 | 70 | 1,622 | 2,480 | — | — | — | — | 0/0/0/0 |
| 300 | 3,989 | 1,240 | 311 | 2,405 | 3,819 | 1,678 | 2,875 | 3,248 | 3,354 | 0/0/0/0 |
| 400 | 4,581 | 1,545 | 337 | 2,908 | 4,285 | 1,739 | 4,057 | 4,318 | 4,370 | 0/0/0/0 |
| 500 | 7,570 | 1,924 | 254 | 3,763 | 7,295 | 3,050 | 6,307 | 6,366 | 6,500 | 0/0/0/0 |
| 600 | 9,885 | 2,416 | 244 | 5,375 | 9,624 | 4,704 | 8,241 | 8,791 | 9,373 | 0/0/0/0 |

> En 20–200 solo se registraron métricas de usuario; la tendencia es consistente con 300–600.

**Lectura:** **cero errores en todos los escalones** (sin 4xx, 5xx, timeouts ni errores de conexión). La latencia crece con la concurrencia y **req/s se satura ≈ 337 (C=400)** y cae a ~244 (C=600). Entre 400→600 la latencia request p95 pasa de ~4.1 s a ~8.2 s: degradación notable, sin fallo.

## Validación específica del Lote 1

- **O3 (peor caso = miss de cache):** 20 specs = 13.3 MB / p50 3.0 s · 50 = 33.3 MB / p50 4.2 s · 100 = 66.5 MB / p95 9.2 s, 0 errores. → **El spec es el coste unitario más pesado y el que primero satura**. Confirma que O3 es crítico: con caché (1 miss/TTL/instancia) no debería repetirse por usuario; cualquier ola de misses (cold start, expiración simultánea) reintroduce este cuello.
- **O5:** llamada admin sin cambios (119–491 ms medido en FASE 0). Cache-hit **NO MEDIBLE** sin la app; por código la lectura normal ya no llama `api.resource`.
- **O9:** 30 paneles directivo simultáneos × 10 lotes = 300 requests en **2.17 s** (panel p50 1.7 s, máx 2.15 s), 0 errores. El batch se mantiene **acotado** bajo concurrencia (antes: 463 queries por panel → inviable).
- **O1:** patrón paralelo confirmado: 215/161 ms caliente vs 961 ms secuencial FASE 0.
- **O8:** 348 ms fijo para 4 asignaciones; el coste deja de crecer con N (verificado por diseño del batch).

## Errores

- **0 errores** (4xx/5xx/timeout/conexión) en toda la rampa 20→600 y en las pruebas específicas.
- **0 errores PostgREST/Supabase** observados.

## Primer cuello detectado (orden de impacto)

1. **Spec OpenAPI en cache-miss**: coste unitario más alto (681 KB) y el que más se degrada con concurrencia (p95 9.2 s @ 100 misses). O3 lo mitiga en caliente; es el riesgo de "ola de misses".
2. **Latencia de Supabase/PostgREST a alta concurrencia** (500–600): p50 request 3.0→4.7 s, req/s saturado → pool de conexiones / serialización de esquema / round-trips por operación.
3. **Operaciones secuenciales por ráfaga** (login = 3 full-scans secuenciales; directivo = cadena) son las que más crecen con N y con concurrencia.

## Veredicto FASE PRE-3

**600 ESTABLE CON DEGRADACIÓN.**

- 600 usuarios simultáneos operaron **sin caída, sin timeouts, sin 5xx** (0 errores en todos los escalones).
- Pero la latencia se degrada de forma medible y significativa al acercarse a 600 (p95 request ≈ 8.2 s; req/s saturado ≈ 244–337), lo que NO cumple "p95 aceptable / p99 controlado".
- La meta "600 estable" requiere FASE 3 dirigida a: (a) verificar y blindar el cache O3 bajo olas de misses; (b) reducir round-trips/latencia de Supabase a alta concurrencia (piscina, menos queries por operación); (c) atacar las ráfagas secuenciales más pesadas (login, directivo).

## Pendientes para FASE 3 (basados en evidencia, no especulativos)

1. Medir el comportamiento del cache O3 con la app real (hit/miss, ola de expiración).
2. Revisar el límite de conexiones de Supabase (pool) y la piscina de PostgREST.
3. Reducir la cadena secuencial del login (respetando la precedencia PROFESORES→ALUMNOS→TUTORES) y del panel directivo.
4. Re-evaluar `select(*)` de materias cuando haya datos reales.

---

**Fin de la FASE PRE-3.** Veredicto: **600 ESTABLE CON DEGRADACIÓN**. Sin cambios de código en esta fase. La FASE 3 debe atacar los cuellos medidos (spec en miss, latencia a alta concurrencia, ráfagas secuenciales).






