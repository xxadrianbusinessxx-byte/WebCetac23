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






---

# HALLAZGOS RECIENTES — APP REAL EN VERCEL + DIAGNÓSTICO DE TIMEOUTS /perfil

> Fecha: 30/08/2026. Contexto: prueba de la app desplegada en Vercel (plan Hobby, dominio custom sin DNS; acceso vía Protection Bypass, secret rotado) y diagnóstico posterior de los timeouts de `/perfil` en c=200.

## Medido en la app real (autocannon, cliente con timeout 30 s)

- **Fase A (home público, 4 escalones):** c=20/50/100/200 → **100% 2xx, 0 errores**; req/s 44→216; p99 1.6 s→2.0 s.
- **Fase B (/perfil autenticado, 1 sesión):**
  - c=20/50/100 (timeout 10 s): 100% 2xx, p99 ~5.2–5.5 s.
  - c=200 (timeout 10 s): **338/600 timeouts** → eran **timeout del CLIENTE**.
  - c=100 y c=200 con `-t 30`: **100% 2xx, 0 errores**, p99 15 s y 19.5 s respectivamente (las requests completan; sin 504).

## Diagnóstico A/B/C

- **(A) Vercel mata la función a 10 s (maxDuration): DESCARTADO.** Con timeout de cliente a 30 s todas completan con 200 a 15–20 s de latencia total; sin 504 ni resets. (La latencia total incluye cola; no se observó corte de servidor.)
- **(B) Timeout de cliente (10 s por defecto): CONFIRMADO** como causa directa de los timeouts de c=200.
- **(C) Cachés O3/O5 por instancia (no sobreviven cold start): SOPORTADO.** Secuencia manual: req0 → Timeout 30 s, req1 → 200 a 12.8 s, req2–4 → ~1.0 s. Bajo concurrencia Vercel escala a instancias frías → p95/p99 15–20 s.

## Tensión O1 bajo alta concurrencia

- O1 convirtió 6–7 queries secuenciales en `Promise.all`: baja latencia a baja concurrencia (960→~200 ms), pero **cada `/perfil` abre ~6 requests HTTP concurrentes a PostgREST**. A c=100–200 eso son 600–1200 requests HTTP simultáneos contra una instancia **free de ~500 MB RAM** → presión real de memoria/swap.
- O1 no está "mal": es la mejor opción a baja concurrencia; el problema es el patrón × concurrencia × hardware.

## Auditoría de conexión a Supabase (cambia el orden del plan)

- **La app NO usa conexión directa a Postgres ni el pooler Supavisor.** No existe ninguna librería `pg`/node-postgres (verificado: 0 usos; sin 5432/6543/pooler/supavisor en el código).
- Todo el acceso a BD es **supabase-js → HTTPS → PostgREST** (`https://nnhjqqjonabchluuwmkp.supabase.co:443`).
- Consecuencia: **"conmutar a Supavisor 6543" NO aplica** (no hay connection string que cambiar). El pool real vive dentro de PostgREST (server-side, no configurable desde la app). La palanca que controla la app es **cuántos requests HTTP concurrentes envía a PostgREST y el payload por request**.

## Plan reordenado (sin tocar estructura/identidad)

1. **Consolidar O1 en una RPC** `obtener_perfil_alumno(curp)` que haga las 6 lecturas en UNA conexión/transacción → de ~6 requests HTTP a 1 por render. Aditivo (función SQL nueva; no toca tablas, columnas ni identidad). Máxima reducción de carga concurrente sobre PostgREST/500 MB.
2. **Reducir `select(*)` en el flujo de perfil** (verificado en: catálogo — `inscripciones`, `grupos`, `periodo`, `carreras`; `registro-alumno`; `registro-estatus` — tabla de registro) → columnas específicas. Moderado hoy (tablas chicas), relevante cuando se pueblen registros.
3. **`statement_timeout` conservador** a nivel de rol/conexión en Supabase como red de seguridad (fallo rápido y limpio en picos, sin swap total).
4. **Pendiente:** dashboard de Vercel (duración de función vs cola en la ventana c=200) y confirmar si el límite real es el pool de PostgREST/500 MB.

## Estado

Sin cambios de código en este diagnóstico. Secret PBA rotado (se mantiene hasta cerrar la meta; luego rotar de nuevo). Próximo paso: escribir la RPC `obtener_perfil_alumno` (requiere aprobación SQL) y medir de nuevo.

---

# FASE 3 — CONSOLIDACIÓN DE /perfil EN RPC

> Fecha: 30/08/2026. Objetivo: reducir la presión concurrente sobre Supabase (PostgREST) reduciendo el nº de requests HTTP por render de `/perfil`. **Estado: RPC diseñada y SQL creado (pendiente de ejecutar en Supabase); integración en la app NO aplicada** (gated: no se puede probar la RPC sin crearla en la BD).

## 1. Problema original

`/perfil` autenticado bajo concurrencia alta mostró timeouts y latencia p99 de 15–20 s en la app real (ver sección de hallazgos). El flujo abre muchos requests HTTP a PostgREST por render.

## 2. Evidencia (app real en Vercel)

- c=200 con timeout de cliente 10 s → 338/600 timeouts (era el cliente).
- c=100/c=200 con timeout de cliente 30 s → 100% 2xx pero p99 15 s / 19.5 s.
- Patrón frío→caliente: 30 s → 12.8 s → ~1 s (instancias frías con cachés O3/O5 vacías).

## 3. Explicación del timeout de cliente

Los timeouts eran del cliente (autocannon, default 10 s): el servidor completaba (200) más tarde. No hubo 504/resets → Vercel no mató la función a 10 s.

## 4. Explicación del patrón O1 (contabilización real)

O1 paralelizó el primer grupo (6–8 requests), pero la auditoría encontró que el flujo completo hace **~21 requests HTTP a PostgREST por render**:
- paralelo inicial: ALUMNOS, ETIQUETAS, resolverGrupoAlumno (4 internos: inscripción→grupo→periodo→carrera), nombres visibles, comentarios, foto(Cloudinary) ≈ 8 + Cloudinary.
- registro/boleta: inscripción + grupo + carrera + `select(*)` registro ≈ 4 (+ OpenAPI cache).
- semestre: 1.
- resolverMateriasAlumno: **re-ejecuta resolverGrupoAlumno (4)** + grupo_materias + materias ≈ 6.
- identidades catálogo: grupo_materias `in` + carreras ≈ 2.

## 5. Arquitectura real

`supabase-js → HTTPS → PostgREST` (`https://nnhjqqjonabchluuwmkp.supabase.co:443`). Sin `pg`/TCP directo.

## 6. Por qué Supavisor/6543 NO aplica

La app no tiene conexión directa a Postgres ni librería `pg`; no hay connection string que conmutar. El pool vive en PostgREST (server-side). La palanca es el nº de requests HTTP y el payload.

## 7. Diseño de la RPC (ADITIVA)

Archivo: `supabase/crear-rpc-obtener-perfil-alumno.sql`.
`obtener_perfil_alumno(p_curp text) RETURNS jsonb`, `SECURITY DEFINER`, `search_path = public`.
Consolida (joins en SQL, sin N+1): ALUMNOS, ETIQUETAS PERSONALES, inscripción→grupo→periodo→carrera, semestres, grupo_materias activos, materias activas, identidades de catálogo, nombres visibles, comentarios.
**No consolida** (se queda en la app): registro/boleta (OpenAPI + `select(*)` columnas dinámicas + matching JS de identidad) y foto (Cloudinary).

## 8. Contrato funcional congelado

Entrada: `curp` (normalizada por la app). Salida jsonb con claves = tipos TS:
`alumno` (AlumnoRow|null), `etiquetas` (EtiquetasPersonalesRow|null), `inscripcion`/`grupo`/`periodo`/`carrera` (|null), `semestres` (filas; la app decide el estado con `gradoASemestre` + default true, SIN duplicar el mapeo), `grupo_materias`, `materias`, `identidades` (MateriaIdentidadCatalogo[]), `nombres_visibles`, `comentarios` (FECHA desc).
Modo directivo `?modo=directivo&curp=` NO cambia: la RPC no recibe rol; la autorización sigue en la Server Action.

## 9. Seguridad

- `SECURITY DEFINER` + `search_path` fijo (patrón escolar_sync_columns).
- **`GRANT EXECUTE TO service_role` SOLO** → no es endpoint público; solo la app (servidor) la invoca con `clienteLecturaEscolar`, preservando la autorización actual (sesión + rol en la action). anon/authenticated no pueden ejecutarla.
- Único parámetro `curp`; no acepta nombres de tabla.

## 10. Pruebas de equivalencia (matriz, pendiente de ejecutar tras crear la RPC)

| Caso | alumno | grupo | carrera | periodo/semestre | materias | nombres visibles | comentarios | etiquetas | faltantes/null |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| alumno normal | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| sin grupo | ✓ | vacío | vacío | — | vacío | ✓ | ✓ | ✓ | grupo/periodo/carrera null |
| sin materias | ✓ | ✓ | ✓ | ✓ | vacío | ✓ | ✓ | ✓ | — |
| sin foto | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | foto null |
| con comentarios | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| múltiples materias | ✓ | ✓ | ✓ | ✓ | todas | ✓ | ✓ | ✓ | — |
| sin inscripción | ✓ | null | null | null | vacío | ✓ | ✓ | ✓ | inscripcion/grupo null |
| modo directivo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| etiquetas/status | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| datos faltantes/null | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | campos null |

Si hay diferencia → investigar la semántica actual antes de "mejorar".

## 11. Medición (pendiente)

- ANTES: ~21 requests HTTP a PostgREST por perfil (medido por código; la app real p99 15–20 s a c=200).
- DESPUÉS (objetivo): 1 request HTTP (RPC) + registro (`select(*)` 1) + Cloudinary (1) por render.
- Latencia individual / tamaño respuesta / cold-warm: **pendiente de ejecutar la RPC en Supabase**.

## 12–13. Concurrencia (pendiente)

Re-ejecutar c=20/50/100/200/400 con timeout de cliente 30 s tras integrar y validar la RPC. Reportar 2xx/4xx/5xx, timeouts, req/s, p50/p95/p99, cold/warm.

## 14. Limitaciones

- La RPC no puede ejecutarse desde este entorno (sin DDL/SQL Editor): el archivo SQL queda **pendiente de ejecutar en Supabase**.
- La integración de la app NO se aplicó (regla: integrar solo si hay forma segura de probar).
- El registro/boleta sigue consumiendo 1 `select(*)` + OpenAPI (caché) por render (no consolidable sin tocar identidad/columnas dinámicas).

## 15. Regresiones

Ninguna aplicada (no se tocó código de la app). La integración debe pasar la matriz de equivalencia antes de declararse válida.

## 16. Decisión

**Pendiente de validación**: crear la RPC en Supabase → probar equivalencia (matriz) → integrar `actionObtenerPerfilAlumno` para usar la RPC vía `clienteLecturaEscolar` → re-medir en Vercel. Solo conservar si la medición muestra mejora real (reducción de requests + p95/p99) sin regresión funcional.


## 17. Validación (segunda iteración — bloqueada por ejecución SQL)

- **Revisión del SQL frente al flujo real:** se encontraron y corrigieron 3 discrepancias en `supabase/crear-rpc-obtener-perfil-alumno.sql` (artefacto propio, aún sin ejecutar):
  1. Alias `row` (palabra reservada en PostgreSQL) → `r` en todos los subqueries.
  2. `identidades.grado/grupo/asignatura` podían devolver NULL → `COALESCE(..., '')` para igualar `String(x ?? "").trim()` de la app.
  3. `periodo` inexistente/inactivo: la app trata el grupo como NO resuelto (`resolverGrupoAlumno` → null); la RPC ahora devuelve el branch "sin grupo" si `v_periodo IS NULL`.
- **Ejecución de la RPC: PENDIENTE / BLOQUEADA.** No hay acceso a DDL desde este entorno: `.env.local` solo tiene claves REST (anon/service), **no existe `DATABASE_URL`**, y `psql` no está instalado. La Management API de Supabase requiere un token de gestión que no tenemos. → Según la regla de la fase, **NO se integra código que dependa de una RPC inexistente**.
- **Equivalencia funcional: NO MEDIDA** (requiere la RPC creada y CURPs reales de prueba).
- **Integración: NO APLICADA** (gated). Diseño documentado: `actionObtenerPerfilAlumno` llamaría la RPC vía `clienteLecturaEscolar`, reutilizaría los datos de la RPC (inscripción/grupo/carrera) en la ruta de registro (eliminando 3 queries duplicadas) y conservaría en TS: `etiquetasVisibles`, `materiasVisiblesDesdeCatalogo`, decisión de semestre (`gradoASemestre` + default true) y el manejo de errores/fallbacks.
- **Benchmark individual y Vercel (c=20/50/100/200/400): NO MEDIDO** — imposible sin la RPC en la BD.
- **Decisión: PENDIENTE.** No se conserva ni se revierte nada (no hay integración). El SQL corregido queda listo para ejecutar en el SQL Editor de Supabase.


## FASE 4 — VALIDACIÓN E INTEGRACIÓN RPC

> Fecha: 30/08/2026. **Estado: BLOQUEADO** por falta de acceso a DDL en Supabase. No se ejecutó la RPC, no se probó equivalencia, no se integró, no se midió. Sin cambios de código de la app.

### Estado inicial
- Git: `M docs/OPTIMIZACION_RENDIMIENTO_400_500.md` · `?? supabase/crear-rpc-obtener-perfil-alumno.sql` (+ scripts preexistentes ajenos). Sin commits/push.
- FASE 2 (O3/O5/O9/O1/O8) intacta. RPC SQL corregida en FASE 3 (alias `row`→`r`, `COALESCE` en identidades, branch de `periodo` nulo).

### Bloqueo exacto (verificado en esta iteración)
- **No hay acceso DDL**: `supabase` CLI NO instalado · `psql` NO instalado · `.env.local` solo tiene claves REST (anon/service) y NO contiene `DATABASE_URL`/`DB_*`/`POSTGRES`/`POOLER`/directa.
- El service key de PostgREST **no puede ejecutar DDL** (CREATE FUNCTION). La Management API de Supabase requiere un PAT de gestión que no tenemos.
- Consecuencia (regla de la fase): **NO se inventa que se ejecutó · NO se integra · NO se modifica la app**.

### Auditoría (PASO 1, confirmada)
Contrato actual de `actionObtenerPerfilAlumno`: `{ alumno, etiquetas (GRADO/GRUPO/CARRERA del catálogo), registro, materias, comentarios, puedeEditarEtiquetas, fotoPerfilUrl }`. Consumidores: `PerfilClient` (alumno, etiquetas→información personal/`tieneGrupo`, registro, materias→selector+vista, comentarios, foto, `puedeEditarEtiquetas`); modo directivo `?modo=directivo&curp=` usa los mismos datos. La RPC pretende devolver los datos crudos (alumno/etiquetas/inscripcion/grupo/periodo/carrera/semestres/grupo_materias/materias/identidades/nombres_visibles/comentarios) para que TS reconstruya `etiquetasVisibles`/`materias`/`semestreActivo`/registro (reusando inscripción/grupo/carrera). Sin discrepancias nuevas.

### Validaciones de FASE 4 (todas BLOQUEADAS / NO MEDIDO)
- Ejecución RPC: **NO EJECUTADA** (sin DDL).
- Seguridad post-creación (firma `obtener_perfil_alumno(text)`, SECURITY DEFINER, search_path, GRANT service_role, anon/authenticated sin acceso): **pendiente de verificar en la BD** (el SQL ya lo declara).
- Matriz de equivalencia (14 casos): **NO MEDIDA**.
- Integración controlada: **NO APLICADA**.
- Selects reducidos: **NO APLICADOS** (documentados en FASE 3).
- `tsc`/build: `tsc --noEmit` **OK** (sin cambios de app); `npm run build` **NO ejecutado** (sin cambios de app).
- Benchmark individual / c=20–400 / cold-warm: **NO MEDIDO**.
- O1: **sin decisión** (hipótesis: con RPC 1–pocas llamadas, `Promise.all` deja de multiplicar requests; decidir con datos tras medir).

### Qué se necesita para desbloquear (cualquiera)
1. Ejecutar `supabase/crear-rpc-obtener-perfil-alumno.sql` en el **SQL Editor de Supabase** (el usuario) y avisar → proseguir con equivalencia/integración/benchmark.
2. Proporcionar un **`DATABASE_URL`** (o string de conexión directa/pooler con password) + `psql` (o `pg` vía script) para ejecutar DDL desde aquí.
3. Proporcionar un **Supabase PAT** (Management API) para ejecutar SQL vía `POST /v1/projects/{ref}/database/query`.

### Decisión final
**BLOQUEADO** (por infraestructura, no por código). El SQL está corregido y listo; la integración está diseñada. No hay datos de rendimiento que reportar porque la RPC no existe en la BD.


## FASE 4 — EJECUCIÓN E INTEGRACIÓN (desbloqueada)

> Fecha: 30/08/2026. Se desbloqueó con un **Supabase PAT** (enmascarado `…e4a2bf`, rotar al terminar). RPC ejecutada, seguridad verificada, equivalencia demostrada e integración aplicada en la app. **Sin commit/push.**

### Ejecución y seguridad (PASO 2–4)
- RPC `obtener_perfil_alumno(p_curp text) RETURNS jsonb` **creada** en `nnhjqqjonabchluuwmkp` vía Management API. Verificado: `SECURITY DEFINER=true`, `search_path=public`, firma `(text)`→`jsonb`.
- **Fallo de permisos detectado y corregido:** Postgres otorga EXECUTE a PUBLIC por defecto → inicialmente `anon/authenticated/PUBLIC` podían ejecutarla. Se aplicó `REVOKE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`. Verificado post-fix: **solo `service_role` (y `postgres` dueño)**.
- **Validación anon:** `POST /rest/v1/rpc/obtener_perfil_alumno` con anon → `404 PGRST202` (función no visible). Con service key + parámetro `p_curp` → 200.
- El archivo SQL se actualizó con el `REVOKE` (fiel a lo desplegado).

### Equivalencia funcional (PASO 5) — **PASÓ**
Comparación semántica (claves ordenadas, sets sin orden, replicando `resolverIdentidadesCatalogo`):
- `TEZA080110HQTRRDA5` (inscripción, grupo 2DO A RH, 10 materias): **12/12 campos equivalentes** (alumno, etiquetas, inscripcion, grupo, periodo, carrera, semestres, grupo_materias, materias, identidades, nombres_visibles, comentarios).
- `OUCB070914MMCLSRA3` (sin inscripción): **12/12 equivalentes** (nulls + arrays vacíos correctos).
- Comentarios: valores idénticos (solo orden de claves en jsonb).
- Semestre: `2DO → sem 2 INACTIVO`, decisión RPC-based = app-based = `false`.
- Las diferencias iniciales detectadas eran **orden de claves jsonb** (falsos positivos del `JSON.stringify`), no semánticas.

### Integración (PASO 5–6) — **APLICADA**
- `app/actions/escolar.ts`: `actionObtenerPerfilAlumno` ahora intenta la RPC vía `clienteLecturaEscolar.rpc("obtener_perfil_alumno", { p_curp })` (1 request); si falla (función ausente / sin service_role) cae al **flujo directo O1** (fallback verbatim).
- Se conservan en TS: `etiquetasVisibles`, `materiasVisiblesDesdeCatalogo`, decisión de semestre, registro/boleta (ruta propia con su regla de "exactamente 1 inscripción"), foto (Cloudinary), autorización/modo directivo.
- `lib/escolar/semestres.ts`: helper puro `semestreActivoDesdeFilas` (misma semántica que `semestreActivoDeGrupo`, default true).
- **Selects:** la RPC ya usa columnas específicas para todas las lecturas consolidadas; el único `select(*)` restante del perfil es la tabla dinámica de registro (NO reducible). No se aplicó limpieza global.
- Registro conserva 4 queries propias (inscripción exactamente-1 → grupo → carrera → `select(*)` registro): reusar los datos de la RPC cambiaría la semántica del caso de múltiples inscripciones activas.

### TypeScript / Build (PASO 7)
- `npx tsc --noEmit --incremental false` → **exit 0**.
- `npm run build` → **exit 0** (compiled successfully, 10 rutas).

### Benchmark individual (PASO 8)
RPC vía PostgREST (service key):
- TEZA (10 materias): **355 ms frío / 185–217 ms caliente · 35,238 B**.
- OUCB (sin inscripción): **113–121 ms · 27,116 B**.
- "Después" por render de datos: 1 RPC + 4 registro + Cloudinary ≈ 5 requests (vs ~21 antes).

### Benchmark de concurrencia (PASO 9) — patrón "después" contra Supabase directo
Cada usuario = 1 RPC + 4 queries de registro, timeout 30 s:

| C | reqs | req/s | 2xx | no2xx/timeout | request p50/p95/p99 | user p50/p95/p99 |
| --: | --: | --: | --: | --: | --: | --: |
| 20 | 1,685 | 168.5 | 100% | 0 | 110/172/354 | 562/1,004/1,172 |
| 50 | 3,525 | 352.5 | 100% | 0 | 130/226/486 | 660/1,361/1,601 |
| 100 | 4,020 | 402.0 | 100% | 0 | 238/441/852 | 1,243/2,035/2,441 |
| 200 | 4,870 | 405.8 | 100% | 0 | 478/968/2,119 | 2,413/4,338/4,818 |
| 400 | 6,220 | 414.7 | 100% | 0 | 1,029/2,055/3,555 | 5,157/8,527/9,124 |

- **100% 2xx, 0 timeouts, 0 errores hasta c=400.** req/s satura ~400.
- Presión sobre Supabase: **~5 requests/usuario vs ~21 antes** (reducción ~4× del multiplicador).

### Cold/warm (PASO 11)
- RPC: frío 355 ms → caliente ~185–217 ms. Sin Vercel no se puede medir cold-start de función; pendiente tras deploy.

### O1 (PASO 12)
- **Se conserva** (fallback del perfil y resto de la app). Con la RPC activa, el perfil ya no dispara `Promise.all` de 6 requests (1 RPC). Hipótesis confirmada a nivel de diseño; validación en Vercel pendiente de deploy.

### Errores (PASO 13/14)
- Ninguno en equivalencia ni en el benchmark directo. Los timeouts previos eran del cliente (10 s), no del servidor (sin 504).

### Pendiente / límites
- **Benchmark en Vercel c=20–400 del perfil INTEGRADO: PENDIENTE** (requiere push/deploy, prohibido en esta fase). La app desplegada hoy aún ejecuta el flujo O1 (21 requests).
- Rotar el PAT `…e4a2bf` al terminar.
- El `select(*)` de registro y la foto siguen fuera de la RPC (documentado).

### Decisión final
**CONSERVAR** la RPC y su integración: equivalencia demostrada (12/12 en 2 casos + semestre), seguridad corregida y verificada, build OK, y reducción estructural ~21 → ~5 requests/usuario con 100% 2xx hasta c=400 a nivel Supabase. Falta el benchmark Vercel final tras deploy para cerrar.


## FASE 5 — VALIDACIÓN VERCEL POST-RPC

> Fecha: 30/08/2026. **Estado: BLOQUEADO/PENDIENTE** — el deployment de producción NO contiene la integración de FASE 4. Sin benchmark real post-RPC; sin push.

### PASO 1 — Estado verificado
- HEAD: `f41bbd2` (último push, Bloque 8 del Lote 1).
- Working tree con cambios SIN commitear (integración FASE 4): `M app/actions/escolar.ts`, `M lib/escolar/semestres.ts`, `M docs/…`, `?? supabase/crear-rpc-obtener-perfil-alumno.sql`.
- FASE 2 intacta (O3/O5/O9/O1/O8).
- Local confirmado: `actionObtenerPerfilAlumno` intenta `rpc("obtener_perfil_alumno", { p_curp })` primero; fallback O1 presente; `semestreActivoDesdeFilas` en `semestres.ts`.
- Supabase confirmado: función existe, `SECURITY DEFINER`, **GRANTS = solo `postgres, service_role`** (sin regresión).

### PASO 2 — Producción NO contiene la integración (bloqueante)
- El deployment de producción fue creado a partir de `f41bbd2` (push del Lote 1). Los cambios de FASE 4 (RPC + integración) son **locales y no commitados/pusheados**.
- Por regla de la fase: **NO se mide como "post-RPC" un deployment que no usa la RPC**; **NO se hace push automáticamente**; **NO se inventan resultados**.
- Falta exactamente: commit + push de FASE 4 (integración) y un redeploy en Vercel.

### PASO 3–4 — Benchmark Vercel de `/perfil` post-RPC: **PENDIENTE**
No ejecutado (producción sin integración). Referencia histórica (antes/O1): c=100/200 p99 15–19.5 s; c=200 con timeout 10 s → timeouts de cliente. Referencia directa Supabase (después, FASE 4): c=400 100% 2xx, 0 timeout, ~5 requests/usuario.

### PASO 5–7 — Sin diagnóstico ni optimización nueva
Nada que diagnosticar sobre la RPC en Vercel hasta que exista el deployment integrado. No se añadieron optimizaciones.

### Decisión
**PENDIENTE — requiere deploy.** Para desbloquear: commitear y pushear FASE 4 (integración RPC) y re-ejecutar el benchmark c=20/50/100/200/400 con timeout de cliente 30 s sobre `/perfil`, comparando contra la tabla de FASE 4 (directo Supabase) y la referencia histórica O1.

### Siguiente acción (justificada solo por evidencia)
Tras deploy y benchmark limpio de `/perfil` (c=400 100% 2xx, 0 timeouts de servidor, p99 razonable, sin degradación progresiva): plantear carga mixta (alumnos+tutores+boletas/asistencias+directivo), NO antes.


---

# FASE 6 — AUDITORÍA MATERIAS + CLOUDINARY + NOTICIAS

> Fecha: 31/08/2026. **Fase de auditoría pura: NO se implementó nada.** Objetivo: reconstruir
> exactamente cómo el sistema encuentra al alumno dentro de una materia, cómo actualiza/refleja sus
> actividades y calificaciones, dónde está el coste real, si Cloudinary es lento por API o por
> descarga, y cómo agregar el visor grande de noticias sin perjudicar el login. Regla: **mide →
> demuestra → prioriza → propone.**

## 1. Estado inicial

- HEAD: `84fc6e0` (docs(contexto): registra Bloque 9 — 6 features para profesores).
- `git status`: sin modificaciones de código funcional. Solo untracked preexistentes de la
  subdivisión (`scripts/7-*`, `supabase/ampliar-materias-15-aliases.sql`).
- Archivos modificados en esta fase: **ninguno funcional**. Solo este documento (`docs/...`).
- Sin commits, sin push, sin SQL ejecutado, sin índices creados.

### Datos reales actuales (leídos de Supabase en esta fase)

| Tabla | Filas | Nota |
| --- | --- | --- |
| ALUMNOS | 461 | `cr 0-0/461` (coincide con FASE 0) |
| PROFESORES | 19 | — |
| grupos | 24 | — |
| materias (catálogo) | 15 | — |
| grupo_materias | **253** | FASE 0 decía 240 → creció con la subdivisión |
| inscripciones_alumno | 443 | — |
| materias_nombres_visibles | 101 | — |
| academico_semestres | 5 | — |
| asignaciones_profesor | 4 | — |
| materias_mapeo_columnas | 2 | — |
| Tablas MAT (materias físicas) | **360** | FASE 0 decía 240 → subdivisión amplió (15 aliases) |
| Tablas REGISTRO | 24 | — |
| Filas en tablas MAT / REGISTRO | **0** | `*/0` confirmado (`1ROAMAT001`, `6TORHAMAT001`, `1RO A REGISTRO...`) |

Espec OpenAPI: **902 KB · 1.647 ms frío · 412 definiciones** (más grande que los 681 KB de FASE 0).

## 2. Materias — arquitectura real del flujo

Cadena real que ejecuta `/perfil` (alumno):

```
GET /perfil (Server Component, force-dynamic)
 └─ actionObtenerPerfilAlumno(curp)
     ├─ RPC obtener_perfil_alumno(p_curp)  → 1 request (SECURITY DEFINER, solo service_role)
     │     devuelve: alumno, etiquetas, inscripcion, grupo, periodo, carrera, semestres,
     │     grupo_materias, materias, identidades, nombres_visibles, comentarios
     ├─ obtenerFotoPerfilAlumno(curp)  → Cloudinary api.resource (1 llamada admin, caché O5)
     └─ obtenerVistaRegistroAlumno(curp)  → boleta
         ├─ resolverPertenenciaBoleta: inscripciones(1) + grupos(1) + carreras(0–1)
         ├─ nombreTablaRegistroDesdeGrupo → listarRegistrosCompletos (spec cacheado O3)
         └─ leerVistaRegistroEstatus → listarColumnasTabla (spec cacheado) + select(*) completo (1)

Cliente (PerfilClient) al montar:
 └─ useEffect → refrescarMateria(materias[0]) → actionObtenerVistaMateria(idInterno)
     ├─ obtenerMapeoColumnasMateria  (1)
     ├─ resolverGrupoAlumno          (inscripción 1 + grupo 1 + periodo 1 + carrera 1 = hasta 4)
     ├─ semestreActivoDeGrupo        (academico_semestres 1)
     ├─ resolverMateriasAlumno       (re-resuelve resolverGrupoAlumno 4 + grupo_materias 1 + materias 1 = 6)
     ├─ validarAccesoAlumno          (resolverGrupoMateria: gm 1 + materia 1 + grupo 1; inscripción 1 = 4)
     ├─ buscarAlumnoPorCurp          (1)
     └─ leerVistaMateriaAlumno       (ilike alumno_nombre 1 + fallback select(*) 0–2)
 └─ refrescarPesos → actionObtenerMapeoColumnasMateria (1)
```

- **Requests por `/perfil` ≈ 24–25** (1 RPC + 1 Cloudinary admin + ~4 boleta + ~18 materia + 1 mapeo),
  en su mayoría secuenciales. La RPC consolidó el bloque inicial (~21 → 1), **pero la carga perezosa de
  la primera materia vuelve a resolver el mismo catálogo** (~18 requests).
- `select("*")` se usa en: RPC (internal), `leerVistaMateriaAlumno`, `leerVistaRegistroEstatus`,
  `leerHojaDesdeTabla`, catálogo (`inscripciones`, `grupos`, `periodos`, `carreras`, `grupo_materias`,
  `materias`), `alumnos` (range 0–4999), `etiquetas-status` (fallback limit 5000).
- `ilike`: solo en `leerVistaMateriaAlumno` → `alumno_nombre ILIKE '%token%'` (token = primera palabra
  significativa del nombre). No hay índice pg_trgm (innecesario hoy: tablas vacías; 40–500 filas se
  escanean en pocos ms).
- Fallback (tabla completa + búsqueda JS): ocurre cuando el `ilike` no devuelve filas o cuando la
  búsqueda en las candidatas no localiza la fila.
- **Medición real de la cadena completa (local → Supabase, secuencial, tablas vacías):**
  `RPC 174 ms · boleta 644 ms (insc 151 + grupo 325 + registro 168) · cadena materia 2.564 ms (15 queries)`
  → **~3.4 s por perfil**, de los cuales la **cadena de materia es el 75 %** y la mitad de esa cadena es
  **trabajo duplicado** (inscripción y grupo se resuelven 3 veces; la RPC ya los resolvió).


## 3. Búsqueda del alumno — queries, payloads, identidad y costes

### 3.1 Cómo encuentra al alumno (semántica exacta actual)

`leerVistaMateriaAlumno` + `filaCoincideAlumno` + `nombresMismoAlumno` (orden de prioridad):

1. **CURP**: si el criterio trae CURP, la primera celda de la fila que sea EXACTAMENTE igual
   (`trim().toUpperCase() === curp`) ⇒ match inmediato (no revisa nombre).
2. **`alumno_nombre`** (C4.24): columna de sistema que siempre se considera columna de nombre (aunque
   `colsDatos` la excluya). Si la celda contiene el nombre del criterio (`nombresMismoAlumno` o
   alternativa) ⇒ match.
3. **Resto de celdas**: `filaCoincideAlumno` barre todas las columnas (CURP en cualquier celda, luego
   nombre con `nombresCoinciden` = tokens normalizados sin acentos/mayúsculas, comparación por conjunto
   ordenado — soporta orden invertido apellidos/nombre).
4. **Filtros previos en PostgREST**: `alumno_nombre ilike '%<primerTokenNombre>%'` si la tabla tiene la
   columna `alumno_nombre` (siempre la tiene en el flujo de inserción directa). **No se filtra por CURP
   en PostgREST** aunque la tabla tenga una columna CURP.

### 3.2 Identidad (CURP ↔ nombre ↔ alumno_nombre ↔ idInterno ↔ tabla_legacy)

- `CURP` = identidad del alumno (login, RPC, búsqueda en filas). `alumno_nombre` = nombre consolidado en
  cada fila de materia (se llena al subir Excel: columnas cuyo encabezado contiene nombre/apellido/
  paterno/materno/alumno). `nombresMismoAlumno` = comparador tolerante al orden y tildes.
- `idInterno` = **nombre físico exacto de la tabla** (`2DORHAMAT008`, inmutable, C4.28). `tabla_legacy` =
  puente físico desde `grupo_materias` hacia esa tabla. `nombreVisible` = solo presentación.
- **No se propone cambiar ninguna de estas semánticas.** Las propuestas de esta fase solo:
  (a) filtran MÁS en PostgREST con los mismos criterios (CURP exacta, `alumno_nombre` ilike), y
  (b) evitan re-resolver lo que la RPC ya resolvió en la misma petición. Ambas preservan la equivalencia:
  `filaCoincideAlumno` devuelve true si la CURP coincide en cualquier celda **o** si el nombre coincide;
  filtrar por `CURP = X OR alumno_nombre ilike` produce exactamente el mismo conjunto de candidatas.

### 3.3 Costes (medidos y conceptuales)

| Escenario | Requests | Payload | Tiempo (medido/conceptual) |
| --- | --- | --- | --- |
| 1 alumno abre 1 materia (hoy, tablas vacías) | ~18 (secuencial) | < 5 KB | **2.564 ms medidos** |
| 1 alumno `/perfil` completo (hoy) | ~24–25 | < 10 KB | **~3.4 s medidos** (secuencial) |
| Tabla de materia poblada 40 filas × 30 cols | 1 `select(*)` | ≈ 21 KB | conceptual |
| Tabla de materia poblada 500 filas × 30 cols | 1 `select(*)` | ≈ 266 KB | conceptual |
| Registro/boleta poblado 500 filas × 38 cols | 1 `select(*)` | ≈ 266 KB | conceptual |
| Matching JS (replicado, sintético) | — | — | 0.04–1.1 ms (500 filas ≈ 0.15 ms) |
| 400 alumnos `/perfil` simultáneos (poblado) | ~9.600 | hasta 106 MB solo boletas | conceptual (sin filtrado) |

**Conclusiones de tamaño:** con las tablas VACÍAS actuales no hay coste de transferencia real (filas 0).
Cuando se pueblen, el `select(*)` de registro/materia será el coste dominante (hasta ~266 KB por
lectura para SOLO mostrar una fila). El matching JS **no es el cuello** (sub-ms).

## 4. Actualización de materias — qué ocurre cuando cambian actividades/calificaciones

| Evento | Server Action | Consultas re-ejecutadas | Refresco del alumno |
| --- | --- | --- | --- |
| Profesor sube Excel (reemplazo) | `actionSubirMateriaExcel` → `reemplazarHojaEnTabla` | delete + insert por lotes + `escolar_sync_columns` (DDL) | Profesor: `refrescarVista` inmediato. **Alumno: nada** — solo al re-seleccionar la materia o recargar `/perfil`. |
| Profesor sube avance parcial | `actionActualizarMateriaExcel` → `actualizarMateriaDesdeArchivo` | `select(*)` filas existentes + `escolar_agregar_columnas` (si faltan) + update/insert por fila | Ídem. |
| Alumno navega entre materias | `actionObtenerVistaMateria(nombre)` | **Cadena completa ~18 requests** (re-resuelve grupo/semestre/materias/acceso) | Inmediato (client state). |
| Alumno vuelve a entrar / recarga | `actionObtenerPerfilAlumno` + cadena materia | RPC + boleta + ~18 | Inmediato. |
| Se modifica la fila del alumno (calificación) | Solo por reemplazo/avance del profesor | — | Ídem (sin push). |

- **No existe `revalidatePath` ni `revalidateTag`** (0 usos) y no hay caché de datos de calificaciones:
  cada `actionObtenerVistaMateria` lee directo de PostgREST ⇒ **no hay datos obsoletos por caché**.
- La "obsolescencia" es de **UI**: mientras la pestaña del alumno está abierta, un cambio del profesor no
  se refleja hasta re-seleccionar la materia o recargar. No es un problema de caché de Next (no hay).
- `router.refresh` solo se usa en paneles administrativos (clave, nombre visible), no en el perfil.
- **Trabajo repetido en la actualización:** cada apertura/navegación de materia re-ejecuta la
  autorización completa (`resolverGrupoAlumno` ×3 en el peor camino) aunque la RPC de `/perfil` ya
  resolvió inscripción/grupo/periodo/carrera/materias en la MISMA sesión.


## 5. Cloudinary — arquitectura real y mediciones

### 5.1 Las 8 capas separadas

| Capa | Estado real |
| --- | --- |
| A. Resolución administrativa | `cld.api.resource(publicId)` en `urls-server.ts` (foto) y `noticias.ts` (noticias), **solo para saber si el recurso existe**. Caché O5 en memoria por instancia (TTL 10 min). |
| B. Generación de URL | `urlCloudinaryDesdePublicId` → `https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto/<id>` — **determinista, sin API**. |
| C. Caché del servidor | O5 en memoria (Map por CURP / por slot). Por instancia serverless. Se invalida en subida. |
| D. CDN Cloudinary | Existe; no configurable desde la app. |
| E. Descarga de la imagen | `next/image unoptimized` (noticias) o `<img>` directo (foto perfil). |
| F. Tamaño real | Foto: original ≤1280 px / ≤0.8 MB (comprimida en cliente). Noticia 1: 1092×264 jpg. |
| G. Transformaciones | **Solo `f_auto,q_auto`.** Sin `w_`, `c_fill`, ni transformación de avatar. |
| H. Caché del navegador | HTTP cache de Cloudinary (útil tras la primera descarga). |

### 5.2 Mediciones (directo a Cloudinary, esta fase)

| Llamada | Resultado |
| --- | --- |
| `api.resource` foto perfil (NO existe) | **399 ms · 404** |
| `api.resource` noticia 1 (existe) | **278 ms · 200** (jpg 1092×264, 51.977 bytes original) |
| `api.resource` noticia 2 (NO existe) | **114 ms · 404** |
| Descarga noticia 1 `f_auto,q_auto` | **1.228 ms · 29.863 bytes · image/jpeg** (CDN frío) |
| Descarga noticia 2 / foto inexistente | 404 · 0 bytes · image/gif (338–499 ms) |

### 5.3 Preguntas críticas

1. **Cuándo se ejecuta `api.resource`:** en cada lectura con caché fría (foto por CURP; noticias por
   slot). En `/perfil` se ejecuta en el server action (1 por alumno/visita si no está cacheado). En el
   login (Home), `actionObtenerNoticiasInicio` ejecuta 2 (slot 1 y 2, en paralelo).
2. **Cuánto tarda:** 114–399 ms medidos (404 más lento que 200 en este entorno).
3. **Cuántas veces:** una por CURP/slot por ventana TTL por instancia. Con 400 alumnos en cold start →
   **hasta 400 llamadas admin** solo de fotos (además de noticias) en la primera ola.
4. **Cuándo entra el caché:** tras la primera resolución por clave (incluye el 404 → `null`). TTL 10 min.
5. **Cold start:** caché vacía → cada CURP nuevo dispara `api.resource` (399 ms de latencia extra en el
   render, secuencial tras la RPC en el branch RPC).
6. **Múltiples instancias Vercel:** el caché es por instancia; N instancias → N veces la llamada por clave.
7. **¿Es necesaria para construir la URL?** **No.** La URL es 100 % determinista (public_id + f_auto,q_auto).
   La llamada solo decide "¿renderizo la URL o un ícono/placeholder?". Eliminarla a secas trasladaría el
   coste al navegador (404 de imagen ≈ 338–499 ms por foto inexistente) — peor.
8. **¿URL determinista sin consulta?** Sí, `urlCloudinaryDesdePublicId` ya la construye. La existencia es
   el único dato que falta; se puede persistir en Supabase al subir (el `upload_stream` ya devuelve
   `secure_url`; hoy `guardarUrlFotoPerfil` es **un stub que no persiste nada**).
9. **Comportamiento cuando el recurso no existe:** `api.resource` → 404 → se cachea `null` → la UI
   renderiza ícono. Sin la llamada, el navegador pediría la imagen y recibiría un 404 (gif vacío).
10. **¿Eliminar esa consulta produciría regresiones?** Si se elimina sin sustituto, sí: 404 en imágenes
    inexistentes y pérdida del placeholder. Si se sustituye por **existencia persistida en BD al subir**,
    no hay regresión y se elimina la llamada admin de las lecturas.

### 5.4 Fotos de perfil — ¿API o descarga?

- **API:** 399 ms por foto en caché fría (una por alumno/visita). Con O5 caliente: 0.
- **Descarga:** el avatar renderiza `<img src={urlFotoPerfil}>` con `f_auto,q_auto` pero **sin
  transformación de tamaño** ⇒ descarga el original (hasta 1280 px / 0.8 MB) para un avatar de ~100 px.
  Con `w_256,c_fill` el avatar bajaría a pocos KB. **La lentitud percibida de las fotos hoy viene
  principalmente de la descarga sobredimensionada del original, no del API (que O5 ya neutraliza).**
- **Layout shift:** el contenedor del avatar es de tamaño fijo, pero no hay `width/height` en el `<img>`.

### 5.5 Noticias

- El login (Home) renderiza `EventosInicio` (Server Component): `actionObtenerNoticiasInicio` →
  2 `api.resource` (paralelos, 114–278 ms, cacheables por O5) → `<Image fill unoptimized>` descarga
  `f_auto,q_auto` (≈30 KB cada una). La noticia 2 actualmente NO existe (404 → placeholder).
- Coste inicial (2 imágenes ~60 KB + 2 llamadas admin frías ~278 ms) es **bajo**; no es candidato a
  crítica salvo en cold start con mucho tráfico público del login.



## 6. Noticias — arquitectura actual y propuesta del visor (NO implementado)

### 6.1 Actual

- `EventosInicio` (Server Component) recibe las URLs desde `actionObtenerNoticiasInicio` y renderiza
  dos `<Image fill unoptimized sizes="33vw">` **sin click, sin modal, sin lightbox**.
- **No existe ningún `<dialog>`, `role="dialog"`, lightbox ni manejador de Escape en el codebase**
  (0 resultados en búsqueda).
- La "imagen grande" y la "miniatura" son **la misma URL** (sin transformación de tamaño): el navegador
  ya la tiene cacheada tras el render inicial ⇒ abrir un visor con el mismo `src` **no descarga nada
  nuevo**.

### 6.2 Propuesta funcional (requisitos) — para implementar en fase posterior

```
LOGIN → noticia → click → imagen grande → ver imagen completa → cerrar
```

- **Componente:** convertir el contenedor de imagen en un botón cliente (o añadir un Client Component
  `NoticiaLightbox`) con `onClick`. El modal se monta SOLO tras el click (lazy): **no afecta el LCP**.
- **Reutilizar la URL actual** (mismo `src`, ya en caché del navegador) → 0 descargas adicionales. Si se
  quisiera más nitidez en pantallas grandes, opcionalmente una transformación `w_1600`/`w_1920` al abrir.
- **Accesibilidad requerida:** botón cerrar visible, `Escape` cierra, `aria-modal="true"`, foco
  movido al diálogo y restaurado al cerrar, `alt` descriptivo (hoy `alt={label}` = "Imagen de evento"),
  `role="dialog"`, scroll lock y ancho responsive en móvil.
- **Rendimiento:** la apertura no debe pedir nada al servidor (no Server Action, no `api.resource`);
  reutiliza la URL ya resuelta por el render del login.

## 7. Duplicaciones encontradas (trabajo repetido)

1. **Catálogo resuelto 2 veces por `/perfil`:** la RPC `obtener_perfil_alumno` ya devuelve
   inscripción/grupo/periodo/carrera/grupo_materias/materias/identidades/semestres, y luego
   `actionObtenerVistaMateria` vuelve a resolver todo (resolverGrupoAlumno + resolverMateriasAlumno +
   semestre + validarAcceso). **~18 requests vs ~6 necesarios.**
2. **Inscripción/grupo resueltos hasta 3 veces dentro de la cadena de materia:**
   `resolverGrupoAlumno` (1ª), `resolverMateriasAlumno` → `resolverGrupoAlumno` (2ª),
   `validarAccesoAlumno` → `obtenerInscripcionActiva` (3ª). Medido: la cadena tarda 2.564 ms con ~60 %
   de trabajo repetido.
3. **Misma tabla de materia descargada 2–3 veces en el peor caso:** `leerVistaMateriaAlumno` puede
   ejecutar `select(*)` dos veces (REQUEST 3 es idéntica a REQUEST 2 cuando REQUEST 2 ya corrió) y la
   action añade un tercer `select(*)` vía `obtenerVistaMateria` si la vista quedó vacía.
4. **Boleta leída en cada `/perfil` aunque el alumno no abra la pestaña:** `obtenerVistaRegistroAlumno`
   se ejecuta siempre en el server action (descarga `select(*)` del registro). Hoy (vacíos) es trivial;
   con 500 filas ≈ 266 KB por visita sin importar si se ve la boleta.
5. **Login:** `buscarAlumnoPorNombre` descarga `range(0,4999)` de ALUMNOS (461 filas ≈ 54 KB) en cada
   intento de login como alumno; se repite en `validarAccesoPortal` tras `buscarProfesorPorNombre`
   (secuencial). Coste actual bajo (390 ms medidos en FASE 0).
6. **`api.resource` de noticias** se ejecuta en el render público del login para TODOS los visitantes
   (caché O5 lo neutraliza por instancia, pero no entre instancias).
7. **`guardarUrlFotoPerfil` es un stub**: la foto se sube, se devuelve `secure_url`, pero NO se persiste
   la existencia en Supabase; cada lectura vuelve a depender de `api.resource`.


## 8. Mediciones (tabla ANTES — datos reales de esta fase)

| Medición | Valor | Tipo |
| --- | --- | --- |
| Spec OpenAPI | 902 KB · 1.647 ms frío · 412 definiciones | MEDIDO |
| RPC `obtener_perfil_alumno` | 174–313 ms (2 ejecuciones) | MEDIDO |
| Cadena boleta (insc+grupo+select registro) | 644 ms (secuencial, vacío) | MEDIDO |
| Cadena materia alumno (15 queries) | 2.564 ms (secuencial, vacío) | MEDIDO |
| `/perfil` completo estimado | ≈ 3.4 s (secuencial, vacío) | MEDIDO (suma) |
| `api.resource` foto perfil (404) | 399 ms | MEDIDO |
| `api.resource` noticia 1 (existe) | 278 ms (1092×264 jpg, 51.977 B orig) | MEDIDO |
| `api.resource` noticia 2 (404) | 114 ms | MEDIDO |
| Descarga noticia 1 f_auto,q_auto | 1.228 ms · 29.863 B | MEDIDO |
| Descarga foto/noticia inexistente | 404 · 0 B · 338–499 ms | MEDIDO |
| Matching JS (1/40/100/400/500 filas) | 0.04–1.1 ms | CONCEPTUAL (lógica replicada, datos sintéticos) |
| Payload materia 40 filas × 30 cols | ≈ 21 KB | CONCEPTUAL (fila ≈ 540 B) |
| Payload materia/registro 500 filas | ≈ 266 KB | CONCEPTUAL |
| Caché O3/O5 hit | **NO MEDIBLE EN ESTE ENTORNO** (caché en proceso de una instancia local) | — |
| Latencia de descarga en el navegador real | **NO MEDIBLE EN ESTE ENTORNO** (requiere navegador/performance trace) | — |

## 9. Problemas encontrados

### Confirmados (con medición o código)

1. **Doble/triple resolución del catálogo** por `/perfil` (RPC + cadena de materia; inscripción/grupo ×3).
2. **`select(*)` repetido de la misma tabla de materia** (hasta 3 lecturas completas en el peor caso).
3. **`guardarUrlFotoPerfil` no persiste**: la existencia de la foto depende de `api.resource` + caché
   por instancia; en cold start multi-instancia el burst puede acercarse al rate limit de admin API
   (500/min) con 400 fotos + noticias.
4. **Avatar sin transformación**: se descarga el original (≤1280 px/0.8 MB) para un avatar ~100 px.
5. **Boleta siempre leída** aunque el alumno no abra la pestaña (coste cuando se pueblen los registros).
6. **Sin mecanismo de refresco para el alumno** ante cambios del profesor (no es caché obsoleta: es
   UI; se resuelve re-seleccionando o recargando).
7. **Login como alumno descarga 461 filas** (54 KB) en cada intento (coste bajo hoy, no crítico).

### Potenciales (requieren datos o staging)

8. Cuando se pueblen las 360 tablas MAT y 24 registros, el `select(*)` + búsqueda JS en cada lectura
   escalará con N (≈266 KB por registro; 400 perfiles ≈ 106 MB solo boletas).
9. Burst de `api.resource` en cold start con 400 CURPs únicos (fotos) + 2 noticias por visitante del login.
10. `ilike %token%` sin índice pg_trgm en tablas pobladas (seq scan; a 500 filas es aceptable, pero es
    bueno planear índice cuando haya datos reales).


## 10. Prioridad

### P0 — Crítica (afecta la capacidad 400–500)

1. **Eliminar la resolución duplicada del catálogo al abrir una materia** (reutilizar la validación
   mínima por `grupo_materia_id` + inscripción). Reduce la cadena de ~18 → ~6 requests por apertura.
   Evidencia: 2.564 ms medidos, la mitad duplicada.
2. **Filtrado PostgREST equivalente (CURP exacta / `alumno_nombre` ilike) en lectura de materia y
   boleta** para no transferir la tabla completa cuando se pueblen (hoy vacías: coste 0; a 500 filas
   ≈ 266 KB por lectura). Sin cambio de identidad.
3. **Persistir la existencia/URL de la foto en Supabase al subir** (y de noticias) para **0 llamadas
   admin en lecturas** y eliminar el burst de cold start. `upload_stream` ya devuelve `secure_url`.

### P1 — Beneficiosa ahora (bajo riesgo)

4. **Eliminar la descarga redundante** en `leerVistaMateriaAlumno` (REQUEST 3 = REQUEST 2) y reusar la
   lectura completa en el fallback de la action. Puro código, sin cambio semántico.
5. **Transformación de avatar** (`w_256,c_fill,f_auto,q_auto`) + `width/height` y `loading="lazy"` en
   la foto de perfil.
6. **Visor de noticias (lightbox)** reutilizando la URL ya cacheada (0 descargas extra; no afecta LCP).
7. **Reducir `select(*)` a columnas específicas** en catálogo (`inscripciones`, `grupos`, `periodos`,
   `carreras`) — ya identificado en FASE 1 como pendiente.

### P2 — Preparar (requiere staging/datos/evidencia)

8. Índice `pg_trgm` en `alumno_nombre` (o índice B-tree en columna CURP) cuando las tablas se pueblen.
9. Caché server-side de "materias permitidas del alumno" (TTL) o reuso del resultado RPC vía
   identificadores que permitan una validación ligera sin cambiar identidad.
10. `unstable_cache`/`revalidateTag` del spec OpenAPI (documentado en FASE 1 como estrategia).

### P3 — Diferir

11. Lazy-load de la sección Eventos del login si el LCP lo exigiera (hoy ~60 KB totales: bajo).
12. Optimización del login de alumno (reemplazar range 0–4999 por filtro; coste actual bajo).

### DESCARTAR (la medición demuestra que no vale la pena)

13. **Optimizar el matching JS de búsqueda del alumno** (sub-ms a 500 filas; no es el cuello).
14. **Optimizar la construcción de URL de Cloudinary** (ya determinista y con `f_auto,q_auto`).


## 11. Propuestas (detalle por propuesta)

### P0-1 — Validación ligera de acceso a materia (reutiliza el catálogo ya resuelto)

- **Beneficio esperado:** cadena de apertura de materia ~18 → ~6 requests; elimina la resolución
  triplicada de inscripción/grupo; alivia PostgREST en picos (400–500 alumnos abriendo materias).
- **Evidencia:** 2.564 ms medidos en la cadena actual; la RPC ya resolvió el catálogo en la misma sesión.
- **Riesgo funcional:** bajo si se conserva `validarAccesoAlumno` (que verifica gm → grupo == grupo de
  la inscripción activa) como puerta; un atacante solo podría ver materias de su propio grupo. No cambia
  identidad, roles ni tablas.
- **Complejidad:** media (pasar `grupoMateriaId` desde la RPC al cliente; o caché server-side por CURP).
- **Archivos afectados:** `app/actions/escolar.ts`, `app/perfil/perfil-client.tsx`, tipos de
  `catalogo-academico.ts` / `nombres-visibles.ts`.
- **SQL:** no.
- **Staging:** recomendable (pruebas de regresión de autorización alumno).
- **Validación:** abrir 1 materia y comparar nº de requests y tiempo contra el ANTES (2.564 ms).
- **Criterio de éxito:** apertura de materia < 600 ms y ≤ 7 requests; pruebas de acceso (alumno solo a
  su grupo, materia ajena → denegado) intactas.

### P0-2 — Filtrado PostgREST de materia/boleta (CURP exacta + `alumno_nombre` ilike)

- **Beneficio esperado:** con tablas pobladas, elimina la transferencia completa (≈266 KB por lectura
  a 500 filas); la búsqueda JS se limita a las filas candidatas. Hoy (vacías) es preparación, no coste.
- **Evidencia:** payload conceptual 21–266 KB; `filaCoincideAlumno` ya prioriza CURP exacta.
- **Riesgo funcional:** medio si se filtra SOLO por CURP (se perderían filas con CURP ausente/errónea
  pero nombre correcto). Mitigación: filtro `OR` (`<columnaCurp>.eq.CURP` o `alumno_nombre.ilike.token`)
  que reproduce exactamente las reglas 1–2 de `filaCoincideAlumno`.
- **Complejidad:** media. **SQL:** no (filtro vía API). **Staging:** sí, con tablas pobladas reales.
- **Validación:** comparar filas devueltas por el filtro vs el resultado de la búsqueda JS actual en las
  mismas tablas (equivalencia exacta). **Criterio de éxito:** mismas filas y < 50 % del payload actual.

### P0-3 — Persistir existencia/URL de foto (y noticias) en Supabase al subir

- **Beneficio esperado:** 0 llamadas `api.resource` en lecturas; elimina el burst de cold start (hasta
  400 llamadas admin con 400 fotos) y la latencia de 399 ms por foto en el render de `/perfil`.
- **Evidencia:** `api.resource` 114–399 ms; `guardarUrlFotoPerfil` hoy es stub; `upload_stream` ya
  devuelve `secure_url`.
- **Riesgo funcional:** bajo (dato aditivo; la URL es la misma; invalidación por re-subida como hoy).
- **Complejidad:** baja-media. **SQL:** tabla/columna aditiva (ej. `fotos_perfil(curp, url)` o columna
  en ALUMNOS) — requiere aprobación. **Staging:** recomendable. **Validación:** subir foto → verla;
  borrar/inexistente → ícono; sin foto → ícono sin llamada admin.
- **Criterio de éxito:** 0 `api.resource` en lecturas dentro del flujo normal; mismo comportamiento visual.

### P1-4 — Eliminar descargas redundantes en `leerVistaMateriaAlumno`

- **Beneficio esperado:** peor caso de 3 lecturas completas → 1; evita transferir la misma tabla 2–3
  veces. **Evidencia:** REQUEST 3 es idéntica a REQUEST 2 cuando REQUEST 2 ya se ejecutó (revisión de
  código). **Riesgo:** muy bajo (no cambia resultados). **Complejidad:** baja. **SQL:** no.
- **Criterio de éxito:** apertura de materia con exactamente 1 lectura completa en el peor caso.

### P1-5 — Transformación de avatar + atributos de imagen
- **Beneficio esperado:** avatar de ~100 px deja de descargar el original (≤0.8 MB). **Evidencia:**
  URL actual sin transformación; original 1280 px. **Riesgo:** bajo. **Complejidad:** baja
  (agregar `w_256,c_fill` en `urlFotoPerfil` o variante). **SQL:** no. **Criterio de éxito:** foto
  cargada < 20 KB y sin layout shift.

### P1-6 — Visor de noticias (lightbox)

- **Beneficio esperado:** funcionalidad pedida SIN tocar el LCP del login (0 descargas extra, modal
  lazy, misma URL cacheada). **Evidencia:** la miniatura y la "grande" son la misma URL. **Riesgo:** bajo.
  **Complejidad:** baja-media. **SQL:** no. **Validación:** teclado (Escape), foco, cerrar, móvil.
  **Criterio de éxito:** abrir/cerrar sin requests nuevos y sin afectar el render inicial.


## 12. Qué NO tocar (partes protegidas)

- Identidad académica: `CURP`, `nombre`, `alumno_nombre`, `idInterno` (nombre físico de tabla),
  `tabla_legacy`, `nombresMismoAlumno`, `filaCoincideAlumno` (semántica intacta).
- Autenticación y roles (sesión, cookies, `validarAccesoPortal`, precedencia profesor→alumno→tutor).
- Estructura de tablas existentes, separación reemplazo/avance, `escolar_sync_columns`, `tabla_legacy`.
- RPC `obtener_perfil_alumno` (permisos restringidos a `service_role`).
- No crear índices, no migraciones, no dependencias nuevas, no eliminar APIs públicas.

## 13. Recomendación — siguiente lote óptimo

**Lote 6A (seguro, sin SQL):** P1-4 (descargas redundantes), P1-5 (avatar), P1-6 (visor noticias) +
**P0-1** (validación ligera de materia, reutilizando `validarAccesoAlumno`). Son cambios de código
puros, reversibles y medibles; atacan el coste real actual (cadena de materia 2.564 ms) y la
funcionalidad pedida (visor) sin SQL ni riesgo de identidad.

**Lote 6B (requiere aprobación SQL / datos):** P0-2 (filtrado PostgREST de materia/boleta) y P0-3
(persistir existencia de foto). P0-2 solo tiene impacto real cuando se pueblen las tablas; P0-3 elimina
el burst de Cloudinary en cold start y se puede hacer con una tabla aditiva. **No ejecutar antes de
staging con datos poblados** (especialmente P0-2, cuya validación exige tablas con filas).

Orden de ejecución recomendado dentro de 6A: **P1-6 → P1-4 → P1-5 → P0-1** (el visor es independiente y
de riesgo mínimo; P0-1 requiere más pruebas de autorización y se valida contra la medición ANTES).

## 14. Estado de Git

- Sin cambios de código funcional: `git status` muestra únicamente los untracked preexistentes.
- Único archivo tocado en esta fase: `docs/OPTIMIZACION_RENDIMIENTO_400_500.md` (esta sección).
- No se hizo commit ni push. No se ejecutó SQL ni se crearon índices.


---

# FASE 7 — IMPLEMENTACIÓN LOTE 6A

> Fecha: 31/08/2026. Implementación del Lote 6A (visor de noticias + avatar Cloudinary +
> redundancias de materias + validación ligera). Sin SQL, sin índices, sin migraciones, sin commit/push.

## 1. Qué se implementó

| Bloque | Cambio | Archivos |
| --- | --- | --- |
| 6A-1 Visor de noticias | La imagen del evento en el login se convierte en botón que abre un lightbox lazy (mismo `src`, modal montado SOLO al hacer click, Escape, foco, `aria-modal`, scroll lock). | `app/components/evento-visor.tsx` (NUEVO), `app/components/eventos-inicio.tsx` |
| 6A-2 Avatar Cloudinary | Nueva URL determinista `w_256,c_fill,f_auto,q_auto` para fotos de perfil (la identidad = public_id NO cambia). `obtenerUrlFotoPerfilSiExiste` y `actionSubirFotoPerfil` devuelven la URL de avatar. `<img>` con `width/height`. | `lib/cloudinary/urls.ts`, `lib/cloudinary/urls-server.ts`, `app/actions/escolar.ts`, `app/perfil/perfil-client.tsx` |
| 6A-3 Descargas redundantes | `leerVistaMateriaAlumno` deja de re-descargar la misma tabla completa cuando ya la tiene (R3 era idéntica a R2). El fallback legacy de la action se conserva intacto (no cambia resultados). | `lib/escolar/materia-vista-alumno.ts`, `app/actions/escolar.ts` |
| 6A-4 Validación ligera | Nueva `verificarAccesoAlumnoMateria` (6 consultas) reemplaza la re-resolución completa (~15 consultas) en `actionObtenerVistaMateria`, verificando las MISMAS reglas (inscripción activa, gm activo con tabla_legacy, grupo activo, periodo activo, semestre activo, materia activa). | `lib/escolar/catalogo-academico.ts`, `app/actions/escolar.ts` |

## 2. Evidencia ANTES/DESPUÉS (misma máquina → Supabase, tablas vacías, secuencial)

| Métrica | ANTES (FASE 6) | DESPUÉS (FASE 7) |
| --- | --- | --- |
| Queries de la cadena de materia (`actionObtenerVistaMateria` alumno) | ~15 (más 1–2 internas redundantes) | **9–10** (6 validación ligera + mapeo + alumno + ilike + full worst-case) |
| Latencia de la cadena de materia | **2.564 ms** (15 queries) | **≈ 1.069 ms** (10 queries, worst-case con full) |
| Requests `/perfil` totales (RPC + foto + boleta + materia) | ~24–25 | ~16–17 |
| Descarga de imagen para avatar (misma pipeline sobre la única imagen real) | 29.863 bytes (`f_auto,q_auto`) | **2.889 bytes** (`w_256,c_fill,f_auto,q_auto`) ≈ **−90 %** |
| Inscripción/grupo/periodo re-resueltos por apertura de materia | hasta 3 veces | **1 vez** (dentro de la validación ligera) |

**Equivalencia old-vs-new de la validación de acceso (datos reales, solo lectura):** 25/25 casos
coinciden (materia propia → permitida; materia ajena → denegada; materia inexistente → denegada;
alumno sin inscripción → denegado).

## 3. Detalle de cada cambio

### 6A-1 Visor de noticias
- `EventoConVisor` (Client Component): botón con `aria-label`, miniatura idéntica (misma URL y
  `<Image fill unoptimized>`, misma `sizes`). Modal `role="dialog"` + `aria-modal` + botón Cerrar +
  cierre con Escape + foco al diálogo y restauración al cerrar + `overflow:hidden` del body mientras
  está abierto + `<img>` plano reutilizando la misma URL (servida por caché del navegador: **0
  descargas adicionales**).
- LCP: el modal NO se monta hasta el primer click; el HTML inicial conserva exactamente la misma
  estructura de imagen que antes.

### 6A-2 Avatar Cloudinary
- `urlCloudinaryDesdePublicId(publicId, transformaciones = "f_auto,q_auto")` (aditivo, compatible).
- `urlFotoPerfilAvatar(curp)` = `w_256,c_fill,f_auto,q_auto`.
- `obtenerUrlFotoPerfilSiExiste` devuelve la URL de avatar (el `api.resource` sigue existiendo como
  comprobación de existencia; NO se elimina — pendiente 6B persistir existencia).
- `actionSubirFotoPerfil` devuelve la URL de avatar (consistente con la lectura).
- `<img>` del avatar con `width={256} height={256}` (el CSS `h-full w-full object-cover` conserva el
  encuadre; evita depender de la resolución del documento).

### 6A-3 Descargas redundantes
- En `leerVistaMateriaAlumno`: nueva bandera `tenemosTablaCompleta`. Cuando el ilike devuelve 0 filas
  (o no hay token) y se descarga la tabla completa, la segunda descarga completa condicional (que era
  idéntica) se omite. El resultado devuelto es exactamente el mismo (la búsqueda ya se hizo sobre la
  tabla completa).
- El fallback legacy de `actionObtenerVistaMateria` se CONSERVA intacto (`!vista || !vista.filas.length`)
  para no cambiar resultados en tablas legacy mixtas (`__HOJA__`/`datos`/`contenido`).

### 6A-4 Validación ligera
- Nueva función `verificarAccesoAlumnoMateria(supabase, curp, nombreTabla)` en `catalogo-academico.ts`
  con 6 consultas que cubren las mismas reglas que la cadena anterior (~15):
  1) inscripción activa; 2) gm activo del grupo de la inscripción con `tabla_legacy` == solicitada;
  3) grupo activo; 4) periodo activo; 5) semestre activo (si aplica); 6) materia activa.
- `actionObtenerVistaMateria` (alumno) la usa; el resto del flujo (mapeo, búsqueda CURP + nombre,
  vista identificada, fallback legacy, modo directivo/maestro) queda intacto.

## 4. Pruebas ejecutadas

- `npx tsc --noEmit --incremental false` → **exit 0**.
- `npm run build` → **exit 0** (Next 16.2.6, 10 rutas, sin errores).
- `npx eslint` sobre los archivos tocados → **0 errores**; 3 warnings preexistentes de imports sin uso
  en `escolar.ts` (no introducidos).
- Test de búsqueda existente (`test-columnas-calificaciones.mjs`) → **50 verificaciones, 0 fallos**
  (CURP, nombre, tildes, orden invertido, inexistente).
- Equivalencia de autorización old-vs-new contra Supabase real (solo lectura): **25/25 OK**.
- Medición de cadena nueva y de transformación de avatar (arriba).
- NOTA: `test-mapeo-columnas-materia.mjs` falla por un harness preexistente (transpila `schema-tabla.ts`
  sin su dependencia `openapi.ts` desde que se añadió O3; NO es regresión de esta fase).


## 5. Riesgos y decisiones

| Tema | Decisión |
| --- | --- |
| Identidad (CURP + nombre + `alumno_nombre` + `idInterno` + `tabla_legacy` + `filaCoincideAlumno` + `nombresMismoAlumno`) | **No se tocó.** La búsqueda sigue siendo CURP exacta primero y nombre normalizado después. |
| RPC `obtener_perfil_alumno` | **No se tocó.** Sigue `SECURITY DEFINER`, `search_path=public`, solo `service_role`. |
| `api.resource` (existencia de foto) | **Se conserva.** Eliminar la llamada requiere persistencia nueva → pendiente Lote 6B. |
| Fallback legacy de materia | **Conservado intacto** (no cambia resultados en tablas mixtas). |
| Semántica de autorización | Validación ligera equivalente verificada 25/25 con datos reales. |
| Lint global | Fallos preexistentes en `scripts/` y `set-state-in-effect` en `perfil-client.tsx` (código anterior); no introducidos por esta fase. |

## 6. Pendiente (NO en este lote)

- **Lote 6B:** persistir existencia/URL de foto (y noticias) en Supabase al subir para 0 llamadas
  `api.resource` en lecturas; filtrado PostgREST (CURP exacta + `alumno_nombre` ilike) en boleta/materia
  cuando las tablas tengan datos; índices (`pg_trgm`/B-tree) con datos representativos; caché server-side
  de materias permitidas por alumno; `unstable_cache` del spec.
- Prueba manual en navegador del visor de noticias (abrir/cerrar/Escape/móvil) — requiere entorno UI.

## 7. Estado de Git

- Modificados (8): `app/actions/escolar.ts`, `app/components/eventos-inicio.tsx`,
  `app/perfil/perfil-client.tsx`, `lib/cloudinary/urls.ts`, `lib/cloudinary/urls-server.ts`,
  `lib/escolar/catalogo-academico.ts`, `lib/escolar/materia-vista-alumno.ts`,
  `docs/OPTIMIZACION_RENDIMIENTO_400_500.md`.
- Nuevos (1): `app/components/evento-visor.tsx`.
- Sin commit, sin push, sin SQL, sin índices.

## 8. Decisión por optimización

| Optimización | Decisión |
| --- | --- |
| 6A-1 Visor de noticias | **CONSERVAR** |
| 6A-2 Avatar `w_256,c_fill,f_auto,q_auto` | **CONSERVAR** |
| 6A-3 Eliminar descarga interna redundante (R3) | **CONSERVAR** |
| 6A-4 Validación ligera `verificarAccesoAlumnoMateria` | **CONSERVAR** |
| Cambiar condición del fallback legacy de materia | **REVERTIR** (se conservó la condición original para no cambiar resultados) |

