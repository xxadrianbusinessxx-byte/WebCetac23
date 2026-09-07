# INFORME — PROMPT-5: Cierre del bloque (verificación y limpieza)

- **Fecha de ejecución:** 2026-09-07
- **Prompt:** `docs/historial/prompts/PROMPT-5-CIERRE-Y-VERIFICACION.md`
- **Estado:** **parcial**. Ejecutadas la **Parte A completa** (A1+A2, con
  autorizaciones humanas) y las tareas autocontenidas de la Parte B (**B1, B2,
  B6, B7**). **B3, B4 y B5 quedan pendientes** con sus puntos de parada
  documentados al final (se ejecutan en la siguiente sesión: son movimientos
  grandes de código y este turno no dejaba margen para verificarlos con el
  contrato «el comportamiento no cambia y las suites lo demuestran»).

---

## 1. Medición previa (§3 del prompt) — pegada

```
PROFESORES: 21 cuentas, 4 claves distintas → 16 comparten "4321", 3 comparten "8080"
debe_cambiar_credenciales = true: 0 de 21
ALUMNOS: 472 · 10 claves duplicadas (pares) · 0 CURPs duplicados
Inscripciones activas: 357 · CURPs con >1 activa: 0 · decision_manual: 58
asignaciones_profesor activas: 0
console.log en lib/ + app/: 23 (todos [6J-login], ruta de login)
.from() en app/actions/: 65
Cambio forzado bloquea 3 de 6 rutas
Suites: 34, sin ejecución automática
```

## 2. Medición posterior (contrato §5.5)

```
node scripts/test-permisos.mjs             → 475 pasadas, 0 fallidas (5 roles)
node scripts/test-auditoria-permisos.mjs   → 146 actions, 229 pasadas, 0 fallidas
node scripts/gen-matriz-permisos.mjs --check → "Al día."
npx tsc --noEmit                           → 0 errores
Las 34 suites (npm run test:suites)        → 34/34
next build                                 → 9 rutas

console.log en lib/ + app/: 23 → 0
Profesores con debe_cambiar_credenciales=true: 0 → 19 de 21
```

## 3. PARTE A — verificación

### A1 · Credenciales duplicadas

- `scripts/diag-credenciales-duplicadas.mjs` (**solo lectura**) mide las tres
  poblaciones. Resultado exacto al §3 del prompt: profesores 21 cuentas con 4
  claves (16 `4321` + 3 `8080` + 2 únicas); **alumnos: 10 pares de clave pero
  `0 pares nombre+clave`** → no hay agujero real (el login exige nombre+clave);
  **tutores: 0 duplicados** de usuario ni clave_tutor.
- Punto de parada A1.2 autorizado: `scripts/migrar-marcar-claves-compartidas-profesores.mjs
  --apply` marcó `debe_cambiar_credenciales=true` a **19 profesores** (16 con
  `4321` + 3 con `8080`). La cuenta técnica ID 21 tiene clave única → **no se
  tocó**. No se inventó ninguna clave: cada profesor la define al entrar (A4).
- Los 10 pares de alumnos se reportan; cambiar el esquema de clave de 472
  alumnos es decisión aparte que **no entra en este prompt** (NO del alcance).

### A2 · Las inscripciones concuerdan con los Excel de `things/`

- `scripts/diag-inscripciones-vs-roster.mjs --roster "…"` (carpeta de Excel como
  **parámetro obligatorio**, nunca ruta incrustada). Compara las 357 activas del
  operativo contra las 10 listas de `things/Alumnos CETAC`.
- Reporte (las cuatro listas):
  1. En la base y no en el Excel: **0** (inicialmente 1: `FIOK090228HGTGSVA3`,
     que era el pendiente humano #5 de PROMPT-1: `S_APELLIDO` mal escrito).
  2. En el Excel y no en la base: **0**.
  3. En ambos pero en grupo distinto: **0**.
  4. CURPs del Excel sin fila en `ALUMNOS`: **0**.
- Autorizado (punto de parada A2): corrección del `S_APELLIDO`
  `OSORNIO` → `OSORIO` en `ALUMNOS` para `FIOK090228HGTGSVA3`. Tras eso, el
  reporte queda **0/0/0/0**: la base concuerda con los Excel.
- Cruce con las 58 marcas de PROMPT-4/T1: ninguna decisión manual contradice el
  roster.

## 4. PARTE B — cierre estructural (lo hecho)

### B1 · Una sola puerta para el cambio de clave (hecho)

El cambio forzado se movió al **layout raíz** (`app/layout.tsx`): si la sesión
trae `debeCambiarCredenciales`, el layout no monta la barra ni la consola de la
ruta — muestra solo `PantallaCambioClaveForzado`. Eso cubre TODAS las rutas del
portal (antes solo `/configuracion`, `/profesor` y `/directivo`; `/perfil`,
`/documentos` y `/tutor` quedaban abiertos). Se retiró la comprobación repetida
de las tres páginas (`configuracion/page.tsx` y los clientes de profesor y
directivo). Con esto A1 es efectivo: un profesor marcado **no puede esquivar** la
pantalla por ninguna ruta.

### B2 · Diagnósticos fuera de la ruta de login (hecho)

Se eliminaron **todos** los `console.log` de `app/` + `lib/` (23, todos
marcados `[6J-login]` en `login.ts`, `portal-login.ts` y `session.ts`). Algunos
registraban el identificador de quien intenta entrar. **0 restantes.**

### B6 · Que las suites corran solas (hecho)

- `scripts/correr-todas-las-suites.mjs`: runner que ejecuta las 34 `test-*.mjs`
  en orden y sale 1 si alguna falla. Scripts npm `test:suites` y `test:permisos`.
- `.github/workflows/verificacion.yml`: en cada push/PR corre `tsc --noEmit` →
  `test:compilar` → `test:suites` → `test:permisos` → `gen:matriz --check` →
  `next build`. Sin credenciales (todas las fases son de solo lectura del
  filesystem; los `diag-*`/`probe-*` con Supabase NO van al CI).

### B7 · Documentación de cierre (hecho)

- `docs/sistema/modulos/CALIFICACIONES-Y-BOLETAS.md`: por qué las ~240 tablas
  físicas por materia son deliberadas (origen Excel, esquema variable por
  materia, columnas en caliente, base del boleta digital) y qué NO se debe
  «optimizar» de paso. Entrada cruzada añadida al GLOSARIO.
- `contexto.feliz` (1 353 líneas de bitácora con banner de histórico) movido a
  `docs/historial/contexto.feliz.md` (R8: no se borra; deja de cruzarse en la
  raíz; ya estaba en `.clineignore`). Referencias de AGENTS.md/ESTADO-ACTUAL
  actualizadas.
- `ESTADO-ACTUAL.md` al día: A1/A2/B1/B2/B6/B7 aplicados; pendientes B3/B4/B5
  marcados con punto de parada.

## 5. PARTE B — pendiente (siguiente sesión, puntos de parada)

Quedan las tres tareas de código grandes, con el contrato «mover, no reescribir»
y su punto de parada explícito:

- **B3 (C1)** — la lógica vuelve a `lib/`: 65 `.from()` en `app/actions/`
  (medición; empieza por `justificaciones.ts` 20 y `asistencias.ts` 15). Prueba
  del algodón: borrando `app/` entero, `lib/` debe seguir compilando.
- **B4 (C2)** — separar puro de I/O: partir en `-puro` los 4 módulos con acceso
  a base importados como valor desde componentes cliente
  (`ciclo/calendario`, `alumno/alumnos`, `materia/nombres-visibles`,
  `materia/mapeo-columnas-materia`) y que el cliente importe solo la mitad pura.
- **B5 (C5)** — resolver `_borrador/`: los 5 componentes de `app/_borrador/` y
  los 7 módulos de `lib/_borrador/` se cablean o se borran contra la §4; el chat
  queda en `_borrador/` (retirada deliberada). Punto de parada obligatorio antes
  de borrar nada: revisar la decisión por archivo.

## 6. Qué NO se tocó (pudiendo hacerlo)

- El esquema de clave de ALUMNOS (472 personas; decisión aparte).
- `eliminar_ciclo`, particionado de `asistencia_alumnos`, matriz de permisos.
- Migraciones de datos que no salieran del reporte de A2 (la única corrección
  fue la ortografía del apellido, autorizada).
- B3/B4/B5 (se dejan para la siguiente sesión con margen de verificación).

## 7. Archivos tocados (resumen)

- `scripts/diag-credenciales-duplicadas.mjs` ·
  `migrar-marcar-claves-compartidas-profesores.mjs` ·
  `diag-inscripciones-vs-roster.mjs` · `correr-todas-las-suites.mjs` (nuevos)
- `app/layout.tsx` · `app/configuracion/page.tsx` ·
  `app/profesor/profesor-client.tsx` · `app/directivo/directivo-client.tsx` (B1)
- `app/actions/login.ts` · `lib/auth/portal-login.ts` · `lib/auth/session.ts` (B2)
- `.github/workflows/verificacion.yml` (B6)
- `docs/sistema/modulos/CALIFICACIONES-Y-BOLETAS.md` ·
  `docs/normativo/GLOSARIO.md` · `docs/historial/contexto.feliz.md` (movido) ·
  `AGENTS.md` · `ESTADO-ACTUAL.md` (B7)

