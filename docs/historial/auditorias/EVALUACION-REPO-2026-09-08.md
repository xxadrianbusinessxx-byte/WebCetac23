# Evaluación del repositorio — 2026-09-08

> Todo lo de aquí está **medido** contra el árbol actual (`c2a035e`) y contra
> Supabase real (diagnósticos de solo lectura en `scripts/diag-*.mjs`).
> Compara contra la evaluación del 2026-09-04 (`ANALISIS-OPTIMIZACION-ESTRUCTURA-CICLO.md`).

## Nota global: **8.2 / 10**

| Dimensión | Nota | Δ vs 09-04 |
|---|---|---|
| Fiabilidad | 9.0 | ▲ mucho |
| Optimización (proceso) | 9.0 | ▲ |
| Estructura | 8.5 | ▲ mucho |
| Filosofía | 8.5 | ▲ |
| Escalabilidad | 8.0 | ▲ mucho |
| Rendimiento | 6.5 | = |

La media esconde lo importante: **cinco dimensiones subieron y una no se movió**,
y justamente la que no se movió contiene el único item barato que quedó abierto.

---

## 1 · Fiabilidad — 9.0

**Base:**
- `npm run test:ci` → **35/35 suites en verde**.
- `test-auditoria-permisos.mjs` audita **146 Server Actions** (229 aserciones) y
  `test-permisos.mjs` suma **475**. Es verificación de que la autorización
  server-side de §7 se cumple *en el código*, no solo en la intención.
- **CI real** en `.github/workflows/verificacion.yml`, disparado en cada push y
  PR: tipos → compilar suites → 35 suites → permisos → matriz → build.
- `npx tsc --noEmit` limpio y **0 `any` explícitos y 0 `@ts-ignore`** en todo
  `app/` + `lib/`. Eso es raro de ver y es la razón principal de esta nota.

**Lo que falta para un 10:**
- **El CI no corre `lint`** (6 pasos, ninguno es lint). Ver §5.
- Las suites son puras: no hay ninguna prueba de integración contra Supabase, ni
  siquiera un smoke de solo lectura. El fallo del `42601` del Prompt C habría
  sido detectado por una.

---

## 2 · Optimización como proceso — 9.0

**Base:** de los 5 puntos del análisis del 09-04, **4 se cerraron en 4 días**:

| | Estado | Evidencia medida |
|---|---|---|
| O-2 duplicación de ciclos | ✅ | 4 periodos → **1** (`2026-2027`, 357 inscripciones) |
| O-3 calendario por texto | ✅ | **77/77** días con `periodo_id` |
| O-4 identidad del profesor | ✅ parcial | 9 FK nuevas; `profesor_id` en uso |
| O-5 ergonomía de pruebas | ✅ | `test:ci`, `test:suites`, `test:compilar` |
| **O-1 RPC sin acotar** | ❌ | sigue igual |

Y la consolidación se hizo **bien**: mismo UUID `7cf5cca7` renombrado, no un
ciclo nuevo. Las 357 inscripciones se conservaron. Es exactamente lo contrario
del incidente P0 que originó `REGLAS_NO_HACER.md`.

---

## 3 · Estructura — 8.5

**Base de la subida:**
- `lib/escolar/` pasó de 68 archivos planos a **7 subcarpetas de dominio**
  (`alumno`, `asistencia`, `catalogo`, `ciclo`, `horario`, `materia`, `tutores`).
- `docs/` pasó de 54 archivos sueltos a **3 categorías con índice**
  (`normativo`, `sistema`, `historial` + `00-INDICE.md`).
- `scripts/_archivo/` con **38 scripts** retirados de la raíz.
- **`lib/_borrador/`**: código sin consumidor, movido en vez de borrado, con un
  README que explica módulo por módulo qué contiene y cuál es el más valioso.
  Sigue compilando bajo `tsc`. Solo lo referencia `app/_borrador/`, o sea que la
  cuarentena es hermética. Es §14 (legacy aislado, no destruido) hecho como el
  manual.

**Lo que baja la nota:**
- **`scripts/` sigue pesando 152 archivos / 16 751 líneas** — más que
  `app/actions` + `app/components` juntos (61 archivos / 16 087 líneas). Aún hay
  **19 `probe-*.mjs`** de un solo uso en la raíz de `scripts/`.
- **4 archivos superan las 1 000 líneas**: `asistencia/asistencias.ts` (1 705),
  `horario/horario-importar.ts` (1 267), `actions/asistencias.ts` (1 157),
  `ciclo/contexto-ciclo.ts` (1 133). El refactor ordenó las *carpetas* pero no
  partió los archivos grandes.

---

## 4 · Filosofía — 8.5

**Base:** el commit `c2a035e` («centraliza permisos y crea el rol técnico») no
es cosmético: la auditoría de 146 Server Actions convierte §7 en algo
verificable. `_borrador/` es §14 aplicado con rigor. La consolidación de ciclos
cierra R4 («no dividir el concepto de ciclo escolar»).

**Lo que falta:**
- **4 archivos siguen con `FALLBACK_LEGACY` / `FALLBACK_TODAS_LAS_MATERIAS`**
  vivos: `asistencia/asistencias.ts`, `catalogo/asignaciones-profesor.ts`,
  `catalogo/catalogo-academico.ts`, `app/actions/materias.ts`. §14 dice que los
  fallbacks quedan *gated y documentados, nunca se amplían* — se cumple, pero
  llevan meses sin retirarse.
- **O-1 viola §4 y §11** y sigue ahí (ver §6).

---

## 5 · Escalabilidad — 8.0

**Base de la subida (de ~5 a 8):**
- `clases_impartidas`: de **0 a 4 FK**. `asistencia_alumnos`: de **0 a 5 FK**,
  incluida `curp → ALUMNOS.CURP`. `justificaciones_asistencia` ganó
  `grupo_materia_id`. Nueve relaciones que antes eran texto suelto.
- Un solo ciclo en lugar de cuatro: las consultas por `tabla_legacy` dejaron de
  multiplicarse.

**Techos que siguen ahí:**
- **`calendario_escolar` sigue sin ninguna FK.** La columna `periodo_id` existe
  y está poblada al 100 %, pero **no hay constraint**: nada impide que mañana
  entre una fila con un `periodo_id` inventado. Es el último resto de R5.
- **`profesor_clave` se sigue escribiendo** (`asistencia/asistencias.ts:277`).
  La contraseña continúa entrando a tablas de datos.
- **15 de 21 profesores comparten contraseña** (antes 16 de 20). Va mejorando a
  mano, pero sigue siendo la mayoría.
- **`asignaciones_profesor` tiene 0 filas.** El traspaso del Prompt D está
  implementado y probado con 26 casos puros, pero **ningún profesor ha subido
  una plantilla todavía**: el mecanismo está sin estrenar en producción.

---

## 6 · Rendimiento — 6.5 · **la única dimensión que no se movió**

### O-1 sigue abierto, y ahora es más peligroso que antes

`supabase/crear-rpc-obtener-perfil-alumno.sql:208`:

```sql
FROM grupo_materias gm
LEFT JOIN grupos g ON g.id = gm.grupo_id
...
WHERE gm.tabla_legacy = ANY(v_tablas_legacy)     -- sigue sin AND gm.grupo_id = v_grupo_id
      AND g.id IS NOT NULL
```

Otras dos consultas del mismo archivo (líneas 174 y 189) **sí** filtran por
`gm.grupo_id = v_grupo_id`. Solo esta se quedó fuera.

**Por qué es más peligroso ahora, no menos:** al consolidar a un solo ciclo, el
sobrecoste bajó de ×4 a ×1. El bug **dejó de manifestarse**. Pero no está
arreglado: vuelve, multiplicado, **el día que se cree el ciclo 2027-2028** —
y para entonces nadie recordará que estaba pendiente. Un bug latente que se
esconde solo es peor que uno visible.

Sigue siendo **una línea**.

### No hay re-medición tras el refactor

`docs/.../OPTIMIZACION_RENDIMIENTO_400_500.md` documenta las FASES 9 y 10 con
números reales (bundle por ruta, 1 000 concurrentes, p50/p95). Pero desde
entonces el repo se reorganizó entero, se añadieron 9 FK y cambió el modelo de
asistencia. **Ninguna de esas cifras se ha vuelto a tomar.** §16 dice medir antes
de optimizar; ahora mismo se estaría optimizando a ciegas.

---

## 7 · El lint se degradó y nadie lo ve

| | 09-04 | 09-08 |
|---|---|---|
| errores | 14 | **140** |
| warnings | 31 | 39 |

Desglose real: **128 de los 140 son `@typescript-eslint/no-require-imports`**,
casi todos en los `.mjs` de `scripts/` (66 archivos) que usan `createRequire`
legítimamente para cargar las suites compiladas.

O sea: **no son defectos, son ruido** — pero ese ruido entierra los **24
hallazgos en `app/` y 5 en `lib/`**, que sí pueden importar. Y como el CI no
corre lint, nadie se entera.

**Arreglo:** excluir `scripts/**/*.mjs` de la regla en `eslint.config.mjs`, ver
qué queda de verdad, y **añadir el paso de lint al CI**.

---

## Puntos a mejorar, por relación coste/beneficio

| # | Qué | Coste | Por qué |
|---|---|---|---|
| 1 | **Cerrar O-1** (`AND gm.grupo_id = v_grupo_id`) | 1 línea | Único item abierto del análisis anterior; hoy invisible, reaparece con el próximo ciclo |
| 2 | **Silenciar el lint de `scripts/` + lint en CI** | ~30 min | Destapa 29 hallazgos reales hoy enterrados bajo 128 falsos |
| 3 | **FK `calendario_escolar.periodo_id → periodos.id`** | 1 sentencia | La columna ya está poblada al 100 %: la FK es gratis y cierra R5 |
| 4 | **Estrenar el traspaso con un profesor real** | 1 subida | 26 pruebas puras no sustituyen un caso real; `asignaciones_profesor` sigue en 0 |
| 5 | **Re-medir rendimiento** (FASE 11) | medio | Las cifras de FASE 9/10 son anteriores al refactor; §16 exige medir |
| 6 | **Terminar las contraseñas de PROFESORES** | manual | 15 de 21 aún comparten clave; y `profesor_clave` se sigue escribiendo en datos |
| 7 | **Partir los 4 archivos de +1 000 líneas** | alto | El refactor ordenó carpetas, no archivos |

**Recomendación:** 1, 2 y 3 caben en una sola sesión corta y cierran el análisis
anterior por completo. El 4 no es código: es pedirle a un profesor que suba una
plantilla y mirar qué pasa.

---

## Lo que este repo hace mejor que la media

No como halago, sino porque conviene no romperlo al refactorizar:

1. **Diagnóstico antes que código.** Cada cambio grande viene precedido de un
   `scripts/diag-*.mjs` de solo lectura, reutilizable y versionado. Por eso los
   informes traen números en vez de suposiciones.
2. **Nada se borra: se mueve.** `_borrador/`, `scripts/_archivo/`,
   `asistencia_traspasos_historico`, `activo=false` en vez de `DELETE`.
3. **Las reglas son ejecutables.** `REGLAS_NO_HACER.md` no es un documento
   muerto: `test-auditoria-permisos.mjs` verifica §7 sobre 146 acciones reales.
4. **Las migraciones las aplica un humano.** Que el SQL se prepare pero no se
   ejecute detectó el `42601` del Prompt C antes de que tocara producción.
