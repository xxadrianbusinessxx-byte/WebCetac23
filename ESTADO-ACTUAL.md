# ESTADO ACTUAL — qué es verdad hoy

Este archivo sustituye a `contexto.feliz` como lectura de arranque.
`docs/historial/contexto.feliz.md` se conserva como bitácora histórica (PROMPT-5/B7:
movido fuera de la raíz, R8), pero **no describe el presente**: es
append-only desde mayo y contiene afirmaciones ya falsas.

Regla de mantenimiento: **este archivo se actualiza en el mismo cambio que lo vuelve
falso.** Si crece más de ~150 líneas, lo que sobra es historial y va a `docs/historial/`.

- **Última revisión:** 2026-09-16 (PROMPT E: el I/O baja a `lib/` y C8/C9 pasan a regla dura)
- **HEAD:** `d71fd59` (2026-09-16) · árbol limpio

---

## 1. Qué es el proyecto

Portal escolar del CETAC 23. Roles: **alumno**, **profesor** (rol `maestro`),
**directivo**, **tutor** y, desde el PROMPT-3, **técnico**.
Next.js 16.2.6 · React 19.2.4 · Supabase (PostgREST + Storage) · Cloudinary · SheetJS.

**No hay REST API propia.** No existe `app/api/`. Todo el transporte navegador→servidor
son Server Actions. Detalle completo en `docs/sistema/FLUJO-TECNICO.md`.

## 2. La raíz del sistema

Un ciclo escolar es una fila de **`periodos`** con un `uuid`. Todo lo académico cuelga
de `periodos.id`. La exclusividad de un solo ciclo operativo la impone PL/pgSQL
(`activar_ciclo_operativo`), no una convención de código.

**Tras PROMPT-1 (2026-09-06):** existe **un solo periodo** en `periodos`:
`2026-2027` = `7cf5cca7` (`activo=true`, `estado=operativo`), renombrado desde
`AGO2026-ENE2027`. Los ciclos `2026-2027` (duplicado del P0) y `BORRADOR` se
eliminaron con la RPC `eliminar_ciclo` tras retirar sus 490 inscripciones
históricas inactivas (duplicados cuyos CURPs ya viven en el operativo).

Fuentes únicas que **no** se duplican (regla R6):

| Concepto | Fuente única |
|---|---|
| Ciclo escolar | `periodos.id` |
| Alumno → grupo | `inscripciones_alumno` |
| Identidad de profesor | `PROFESORES.ID` |
| Identidad de materia | `idInterno` = nombre de la tabla física |
| Parciales | `periodos_evaluacion` |

## 3. Deudas estructurales vivas

Las tres, con su manifestación y ubicación, están en
`docs/sistema/MAPA-DEL-SISTEMA.md` §2. En resumen:

1. **Calendario con dos identidades** — tras PROMPT-1/T2 el calendario del
   operativo cuelga de `periodo_id` (bucket canónico `SEMESTRE AGO26-ENE27`,
   77 filas, ligadas a `7cf5cca7`). La columna texto `ciclo_escolar`
   (`@deprecated`) se conserva como legado (R8) y ya no se escribe por ella.
2. **Identidad del profesor** — 16 de 20 comparten CLAVE `4321`; `profesor_clave` queda como columna legacy.
3. **Una tabla física por materia** — nombres en texto, columnas creadas en caliente por RPC.

Ninguna se cierra «de paso»: cada una necesita su propia migración verificada (R8).

## 4. Seguridad — cómo está realmente

- Sesión: cookie httpOnly firmada con HMAC-SHA256, 7 días (`lib/auth/session.ts`).
- Tutores: scrypt + `timingSafeEqual`. Contraseña inicial derivada del CURP del hijo.
- **RLS no autoriza nada.** Las policies son `*_all USING (true)`. La autorización real
  vive en TypeScript. Desde el PROMPT-2, la decisión «qué puede un rol» está
  centralizada en `lib/auth/permisos.ts` (`exigir()` al inicio de cada Server Action);
  las decisiones de alcance «sobre quién» se conservan ortogonales
  (`resolverAccesoAlumno`, `nivelAccesoProfesor`). Es una decisión consciente, pero
  significa que **un bug de autorización en TS es un bug de seguridad sin red debajo**.
- **Rediseño Océano · Fase 0 (2026-09-10) — regla estructural.** El conjunto
  `directivo` de `lib/auth/permisos.ts` **ganó tres capacidades** del conjunto de
  `maestro`, por **decisión explícita del responsable** (2026-09-10), para sostener un
  rol de supervisión global que pueda operar sin depender de asignaciones (R-4). No es
  la reparación de un descuido: antes del cambio la §4 decía `X` en las tres filas, y la
  §4 es un espejo generado de `permisos.ts`. Hasta hoy estas actions respondían
  «no tienes permiso» al directivo:
  - `asistencia.subir` → `actionDescargarPlantillaAsistencia`,
    `actionPrevisualizarAsistencias`, `actionConfirmarAsistencias` (`asistencias.ts`).
  - `ciclo.ver` → `actionListarCiclosEscolares` (`calendario.ts`).
  - `justificacion.solicitar` → `actionSolicitarJustificacionAsistencia`,
    `actionSolicitarJustificacionConArchivo`, `actionObtenerMateriasJustificables`.
  Ninguna otra capacidad y ningún otro rol se tocó: **solo se editó la matriz**, ninguna
  action cambió su `exigir()` ni `capacidades.ts`. Es un cambio **puramente aditivo**
  (ningún rol pierde nada). §4 regenerada con `scripts/gen-seccion4.mjs`; la §5 no se
  movió (`npm run gen:matriz -- --check` = 0). Validado con `tsc --noEmit`,
  `test-permisos.mjs`, `test-auditoria-permisos.mjs` y `next build`.
  **Consecuencia anotada (no descubrirla después):** directivo ya tenía
  `justificacion.resolver`; con `justificacion.solicitar` puede **solicitar y aprobar la
  misma justificación**. Es intencionado (supervisión global sin depender de
  asignaciones), no un efecto colateral.
- Todo `scripts/` corre con `service_role` y salta RLS. No hay entorno de staging.

## 5. Estado de datos — última medición conocida

> Cifras medidas el **2026-09-06** tras ejecutar PROMPT-1 (`p0-diag-contexto.mjs`,
> `diag-calendario-periodo.mjs`, `probe-columnas-asistencia.mjs`,
> `diag-relaciones-supabase.mjs`). Antes de apoyarse en cualquiera: volver a
> correr el mismo script.

- **Un solo periodo**: `2026-2027` (`7cf5cca7`), operativo.
- Grupos / materias activas / inscripciones activas / bloques de horario:
  **24 / 241 / 357 / 168** (412 activas antes de T3 → −55 duplicadas).
- **0 CURPs con más de una inscripción activa** (eran 55).
- Calendario del operativo: **77 filas** ligadas por `periodo_id` (73 clase,
  3 descanso, 1 festivo; bucket textual canónico `SEMESTRE AGO26-ENE27`).
  Ya no hay buckets de texto solapados sin `periodo_id`.
- `asistencia_alumnos`: **3 863 filas** (conteo exacto) → **3 795 con
  `periodo_id`/`periodo_evaluacion_id`**; 68 filas históricas sin fecha dentro
  del rango del operativo quedan NULL (se reportan, no se inventó).
- `clases_impartidas`: 81 filas históricas **intactas** (T4: autoría
  irrecuperable, no se tocan).
- `justificaciones_asistencia`: pendiente humano aplicar el SQL de PROMPT-1/T1
  (`agregar-grupo-materia-justificaciones.sql`) para soportar la justificación
  por clase con `grupo_materia_id`.
- Huérfanos en las 9 FK de asistencia: **0**.
- **PROFESORES**: 21 filas (desde PROMPT-3). Una es el rol **técnico**:
  `ID 21 · "TECNICO" · Permisos='Tecnico' · debe_cambiar_credenciales=true`
  (clave inicial `TECNICO26`, se cambia en el primer acceso). Sigue pendiente
  humano corregir las CLAVE duplicadas de los 20 profesores.
- `asignaciones_profesor`: **0 filas** en el operativo a la fecha de esta
  revisión (el DDL C4.11 con `profesor_id` está aplicado). La consola de
  asignación del técnico (PROMPT-3/T3) está lista; poblar la atribución es
  tarea operativa del técnico desde la web (A2).
- `debe_cambiar_credenciales`: la cuenta técnica lo tiene en `true` (A4:
  cambio forzado en el primer acceso).

## 5b. Inscripciones — decisión humana congelada (PROMPT-4/T1, 2026-09-06)

**Resuelto.** La reactivación del ciclo YA NO invierte decisiones humanas. Antes,
`inscripciones_alumno.activo` significaba «pertenece al ciclo operativo» y
`sincronizarInscripcionesOperativo()` recalculaba ese estado en cada activación
eligiendo la fila más reciente por `created_at` — pisando la deduplicación por
roster del PROMPT-1/T3 (dos autoridades sobre el mismo dato; ganaba la última).

Opción A aplicada (columna aditiva `decision_manual` + `motivo` en
`inscripciones_alumno`; `.sql`: `supabase/agregar-decision-manual-inscripciones.sql`).
La sincronización ahora **no toca** las filas marcadas con `decision_manual=true`
y elige por fecha solo entre las no marcadas.

- Filas marcadas: **58** (57 CURPs con la más reciente inactiva + 1 fila extra en
  cascada de la CURP `AAGC080710HVZLRRA6`, que tiene 3 filas con el mismo
  `created_at` y necesitaba marcar dos inactivas).
- Riesgo de inversión al reactivar: **57 → 0** (`diag-inscripciones-reactivacion.mjs`).
- Suite nueva: `scripts/test-reactivacion-inscripciones.mjs` (16 checks, pura).
- Medición: 92 CURPs con más de una fila en el operativo; 0 con la más reciente
  (sin marca) inactiva.

## 5c. Credenciales — resuelto en A1 (PROMPT-5, 2026-09-07)

| Población | Antes (medición §3) | Después |
|---|---|---|
| `PROFESORES` | 21 cuentas, 4 claves distintas (16 + 3 compartiendo) | **19 de 21 con `debe_cambiar_credenciales=true`**; los 2 restantes (técnico ID 21 y 1 cuenta más) tienen clave única |
| `ALUMNOS` | 472 · 10 claves duplicadas (pares) · 0 CURPs duplicados | 472 · 10 pares siguen (decisión aparte, no entra en PROMPT-5) · **0 pares comparten nombre+clave** (no hay agujero real) |
| tutores | — | **0 duplicados** de usuario/clave_tutor |

**A1 aplicado:** `diag-credenciales-duplicadas.mjs` (LEE) midió las tres
poblaciones; `migrar-marcar-claves-compartidas-profesores.mjs --apply`
(autorizado) marcó a los 19 profesores con clave compartida (16 `4321` + 3
`8080`); el técnico ID 21 tiene clave única y no se tocó. No se inventó ninguna
clave: cada profesor la define al entrar (A4). **B1 tapó el hueco de la puerta**
(el layout raíz bloquea las 6 rutas, no solo 3).

Las 10 claves duplicadas de alumno **no son un agujero de autenticación**:
`validarAccesoPortal()` exige nombre + clave, no clave sola (0 pares
nombre+clave). Pero la clave son los últimos 6 caracteres del CURP; cambiar el
esquema de clave de 472 alumnos es decisión aparte y no entra en este prompt.


## 6. Pendiente humano (no lo puede hacer un agente)

> Reconciliado contra la base el **2026-09-16** con `scripts/diag-sql-aplicado.mjs`.
> Se retiraron 4 pendientes que ya estaban resueltos (el SQL de
> `grupo_materia_id`, las 9 FK, la atribución de profesor y «commitear»).
> De los 44 `.sql` del repo **solo 1 sigue sin aplicar**, y es un concepto
> abandonado: `agregar-periodo-vigente.sql` (`periodos.vigente`, sin uso en código).

1. **Ejecutar en el SQL Editor** (preparados, idempotentes, en este orden):
   - `supabase/crear-rpc-obtener-perfil-alumno.sql` — reemplaza la RPC con el
     filtro O-1 (`AND gm.grupo_id = v_grupo_id`). Sin él, cada materia del
     alumno devuelve una fila por ciclo y gana una al azar. Hoy no se nota
     (un solo ciclo); reaparece al crear 2027-2028.
   - `supabase/agregar-fk-calendario-periodo.sql` — última FK que faltaba
     (R5). La columna ya está poblada 77/77; el script reporta y aborta si
     encontrara huérfanos, nunca borra.
   - `supabase/agregar-indices-asistencia.sql` — único cuya aplicación no se
     puede verificar por PostgREST (los índices no salen en el spec). Con
     3 863 filas en `asistencia_alumnos` conviene confirmarlo a mano.
2. **Corregir las CLAVE duplicadas de `PROFESORES`.** La marca
   `debe_cambiar_credenciales=true` está puesta en 19 cuentas (PROMPT-5/A1);
   cada profesor la cambia al entrar (flujo A4). Medición 2026-09-16:
   **15 de 21 aún comparten clave**.
3. Rotar la contraseña de Supabase y eliminar cualquier copia en texto plano
   fuera del repo.
4. Decidir qué hacer con las **68 filas** de `asistencia_alumnos` sin
   `periodo_id` (de 3 863; fechas fuera del rango del operativo). Son
   históricas del clon; se conservan sin atribuir.
5. **Estrenar el traspaso de materia**: `asignaciones_profesor` sigue en **0
   filas**. La consola del técnico está lista y el Prompt D tiene 26 casos
   puros, pero nadie ha subido una plantilla todavía. Es el código sin
   estrenar de mayor riesgo del sistema.
6. PROMPT-4/T4: si el técnico deshace un paso sobre datos reales de un ciclo
   BORRADOR, hacerlo con la previsualización del panel.

Las 81 filas históricas de `clases_impartidas` con clave `4321` tienen **autoría
irrecuperable**: no se backfillea `profesor_id`, inventar la atribución sería peor.

## 7. Estructura del repositorio

Reorganizado el 2026-09-06. Dónde va cada cosa: `docs/normativo/ORDEN.md`.

```
app/      actions/ · components/ (paneles) · components/ui/ (primitivas) · components/oceano/ (shell Fase 1) · _borrador/
app/oceano/  previsualización del shell Océano (no sustituye a ninguna ruta viva)
lib/      escolar/<7 familias> + transversales en la raíz · auth/ · supabase/ · _borrador/
scripts/  vivos · _peligrosos/ (no ejecutar) · _archivo/ (no re-ejecutar)
docs/     normativo/ (obliga) · sistema/ (el presente) · historial/ (el pasado)
```

Red de pruebas: **37 suites**, 0 fallos; `npx tsc --noEmit` en 0 errores;
`next build` completa con **9 rutas**.
`test-permisos.mjs` compara el código contra la §4 de
`docs/sistema/MATRIZ-PERMISOS.md` con los **5 roles** (475 checks).
Desde PROMPT-5/B6 hay un runner único (`npm run test:suites` →
`scripts/correr-todas-las-suites.mjs`) y un workflow de CI
(`.github/workflows/verificacion.yml`: tsc · compilar · suites ·
permisos · gen:matriz --check · verificar:estado · build).

**La 37.ª no prueba un módulo: prueba el REPO.** `scripts/test-orden.mjs`
(2026-09-16) es la mitad mecánica de `docs/normativo/ORDEN.md`. Existe porque
las reglas de capas eran prosa, y este repo lo tocan dos agentes de IA además
de una persona: se puede entregar código que compila, pasa las suites y aun
así subió lógica a la action, importó `@/` dentro de `lib/escolar/` (rompe las
suites sin romper el build) o llamó `probe-` a un script que escribe. Ni `tsc`
ni el build ven nada de eso.

Diez reglas, en dos modos. **Duras** (umbral 0, se cumplen hoy y ya no se
pueden romper por descuido): C1 alias `@/` en `lib/escolar`, C2 `lib/`→`app/`,
C3 cliente con `lib/supabase`/`server-only`, C4 action→action, C5 `-puro` con
I/O, C6 `test-`/`diag-`/`probe-` que escriben, C7 raíz cerrada, **C8 ninguna
action habla con Supabase** y **C9 ningún archivo de `app/` o `lib/` pasa de
1 000 líneas**.
**Trinquete** (deuda declarada con prompt asignado; fallan solo si el número
SUBE): C10 = 35 scripts sin fila en `scripts/README.md`; el umbral es lo que
permite añadir un guardián a un repo vivo, porque una regla que falla desde el
primer día por deuda preexistente se desactiva en una semana.

C8 y C9 nacieron como trinquete (13 actions con `.from()` y 7 archivos >1 000
líneas) y **cerraron el 2026-09-16 al ejecutarse `PROMPT_E_CAPAS_Y_TAMANO.md`
(partes 1–4)**: el I/O bajó a `lib/` y los seis gigantes se partieron por
responsabilidad, con los re-exports intactos. Al llegar a 0 los dos umbrales
pasaron a regla DURA. Informe: `docs/historial/informes/INFORME-PROMPT-E-CAPAS-Y-TAMANO.md`.

**Cómo se llegó hasta aquí → `docs/historial/BITACORA-2026-09.md`.**
El relato fase por fase (PROMPT-2 a PROMPT-5, rediseño Océano 1 a 9) vivía aquí
y eran 274 líneas —el 52 % de este archivo— que todo agente pagaba al arrancar
para leer historia ya cerrada. Se movió entero, sin borrar nada (R8). Este
archivo dice qué es verdad HOY; la bitácora dice por qué se hizo así.

## 8. Cómo se valida un cambio

```bash
npx tsc --noEmit
npm run build
node scripts/<la suite pura del módulo>.mjs   # ver scripts/README.md
```

Si tocaste un módulo puro, antes de la suite: `npm run test:compilar`.

Checklist completo de aceptación: `docs/normativo/CONTRATO-DE-CAMBIO.md`.
