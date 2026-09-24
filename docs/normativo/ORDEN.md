# ORDEN — dónde va cada cosa

NORMATIVO. Responde una sola pregunta: **«tengo que escribir X, ¿dónde va?»**
Si algo no encaja en ninguna fila de este documento, es señal de que el concepto está
mal planteado, no de que falte una carpeta.

Hay seis órdenes independientes. Cada uno tiene su tabla de decisión.

| # | Orden | Gobierna |
|---|---|---|
| 1 | [Orden de rutas](#1-orden-de-rutas) | dónde vive un archivo |
| 2 | [Orden de capas](#2-orden-de-capas) | qué puede importar qué |
| 3 | [Orden de funciones](#3-orden-de-funciones) | cómo se nombra y dónde se coloca una función |
| 4 | [Orden de scripts](#4-orden-de-scripts) | qué es ejecutable y con qué riesgo |
| 5 | [Orden de SQL](#5-orden-de-sql) | esquema y RPC |
| 6 | [Orden de prompts](#6-orden-de-prompts) | cómo se encarga y se archiva el trabajo |

---

## 1. Orden de rutas

### Tabla de decisión

| Voy a escribir… | Va en | Nombre |
|---|---|---|
| Una pantalla nueva (URL) | `app/<ruta>/page.tsx` | `page.tsx` (Server Component, sin `"use client"`) |
| Su parte interactiva | `app/<ruta>/<ruta>-client.tsx` | `<ruta>-client.tsx` |
| Un panel de dominio reutilizable | `app/components/<dominio>-panel.tsx` | sufijo `-panel` |
| Un panel de administración | `app/components/<dominio>-admin.tsx` | sufijo `-admin` |
| Un componente visual sin dominio (fondo, píldora, icono) | `app/components/ui/` | sin sufijo de dominio |
| Un asistente de varios pasos | `app/components/<dominio>-configurador/` + `paso-*.tsx` | carpeta propia |
| El puente navegador→servidor | `app/actions/<dominio>.ts` | `"use server"`, exports `action*` |
| La lógica de negocio | `lib/escolar/<familia>/<dominio>.ts` | verbos de dominio — familias en §1b |
| Una decisión probable sin base de datos | `lib/escolar/<familia>/<dominio>-puro.ts` | sufijo `-puro` si convive con su versión con I/O |
| Sesión, login, cookies | `lib/auth/` | — |
| Cliente de base de datos | `lib/supabase/` | — |
| API externa | `lib/<servicio>/` (p. ej. `lib/cloudinary/`) | — |
| Cambio de esquema | `supabase/<verbo>-<objeto>.sql` | ver §5 |
| Herramienta de diagnóstico | `scripts/diag-<qué-mide>.mjs` | ver §4 |
| Migración de datos | `scripts/migrar-<qué-mueve>.mjs` | dry-run por defecto, `--apply` para escribir |
| Prueba de un módulo puro | `scripts/test-<módulo>.mjs` | ver §4 |
| Imagen de decoración | `decoraciones imagenes/` (fuente), nunca `public/` a mano | `npm run sync:decoraciones` copia a `public/` |
| Una utilidad transversal (la usan 3+ familias) | `lib/escolar/` (raíz) | nombre genérico: `nombres.ts`, `fechas.ts`, `csv.ts` |
| Un informe de trabajo terminado | `docs/historial/informes/` | ver §6 |
| UI o dominio escrito pero sin cablear | `app/_borrador/` o `lib/_borrador/` | ver el README de cada carpeta |


### 1b. Familias de `lib/escolar/`

`lib/escolar/` estaba plano con 64 archivos. Hoy se agrupa por familia; la familia es
la misma unidad que usan `docs/sistema/MAPA-DEL-SISTEMA.md` y este documento.

| Familia | Qué contiene |
|---|---|
| `ciclo/` | ciclo-estado (+`-puro`), orquestador, contexto, evaluaciones, calendario, semestres, eliminar-ciclo |
| `asistencia/` | asistencias, asistencia-parcial, asistencia-contexto, atribucion-profesor, justificaciones |
| `horario/` | horario-semanal (consulta), horario-importar (Excel) |
| `materia/` | identidad, avance, mapeo de columnas, nombres visibles, schema/hoja/contenido de tabla, traspaso |
| `alumno/` | alumnos, acceso, registro, estatus, información personal, foto, todas las `etiquetas*` |
| `catalogo/` | catalogo-academico, carga-academica, inscripciones-borrador, grupos, asignaciones, profesores, roster-validacion |
| `tutores/` | tutores, tutores-types |
| (raíz) | transversales: `tables`, `types`, `nombres`, `fechas`, `csv`, `buscar-en-filas`, `matriz-hoja`, `exportar-xlsx`, `excel-a-registros`, `openapi`, `comentarios`, `documentos` |

**Dentro de `lib/escolar/` los imports son relativos, y en todo `lib/` llevan
extensión** (`./x.ts`, `../familia/x.ts`), nunca `@/`. No es estilo: las suites cargan
`lib/` con Node, que ejecuta los `.ts` directamente (PROMPT H-bis) y tiene dos
limitaciones que el bundler de Next no tiene:

- **no resuelve el alias `@/`** — un import absoluto rompe la suite sin romper el build.
  Lo vigila **C1**.
- **exige la extensión exacta** — `from "../tables"` no resuelve y `from "../tables.ts"`
  sí. `tsc` y el build aceptan las dos formas en silencio (`allowImportingTsExtensions`),
  así que quitar una extensión solo rompe la suite que cargue ese módulo, si la hay. Lo
  vigila **C13**.

Desde `app/` sí se usa `@/lib/escolar/<familia>/<x>`, sin extensión: a `app/` solo lo
carga el bundler, nunca Node.

### Reglas de ruta

- **Un dominio, un nombre, en las tres capas.** `asistencias` se llama igual en
  `app/components/asistencias-panel.tsx`, `app/actions/asistencias.ts` y
  `lib/escolar/asistencia/asistencias.ts`. Esa repetición es intencional: es lo que hace el árbol
  navegable sin buscador.
- **`app/<ruta>/` solo contiene lo exclusivo de esa ruta.** Si un componente lo usan dos
  rutas, sube a `app/components/`. Si vive bajo una ruta y lo importa otra, está mal
  colocado.
- **Nunca `public/` a mano** para decoraciones: es salida generada.
- **Una pieza de presentación se define una vez.** Un componente visual sin dominio
  (píldora, pestaña, aviso, campo) vive en `app/components/ui/` y se **importa**; si el
  mismo nombre se declara en dos archivos de `app/`, está mal, aunque los dos «se vean
  bien». Lo vigila la regla **C11** de `test-orden.mjs` (trinquete en 21 copias sobrantes),
  y el plan que las unifica es `docs/sistema/MATRIZ-UX.md` §7 (F-UX1).
- Nada nuevo en la raíz del repo. La raíz ya está cerrada: configuración, los cuatro
  documentos de arranque y `Name_of_archives_excels_CSVs`.

---

## 2. Orden de capas

```
app/**/page.tsx          Server Component: resuelve sesión y renderiza
   ↓
app/**/*-client.tsx      "use client": estado de UI, nada de negocio
   ↓
app/actions/<dom>.ts     "use server": **empieza por exigir()**, delega, formatea respuesta
   ↓
lib/escolar/<fam>/<dom>.ts   dominio: la lógica real
   ↓
lib/supabase/*           acceso a datos
   ↓
supabase/*.sql           esquema, RPC, triggers
```

### Quién puede importar a quién

| Capa | Puede importar | Nunca importa |
|---|---|---|
| `page.tsx` | actions, components, `lib/auth` | otra `page.tsx` |
| `*-client.tsx` | actions, components, tipos de `lib/` | `lib/supabase/*`, nada con `server-only` |
| `app/actions/` | todo `lib/` | otro `app/actions/` |
| `lib/validacion/` (esquemas de entrada) | `valibot` y nada más: es un módulo puro | Supabase, `app/`, I/O de cualquier tipo |
| `lib/auth/` (permisos, exigir, capacidades) | `lib/auth/types` y nada de Supabase en el módulo puro | decidir permisos desde la action |

> **Un `"use server"` exporta funciones async y nada más.** Ni `export { … }` ni
> `export type { … }`: Next con Turbopack —lo que compila Vercel— registra cada
> nombre de esa lista como Server Action, y si es un tipo el módulo revienta al
> cargarse. Del 17 al 23 de septiembre, tres reexportaciones de tipos tumbaron
> **todas** las acciones de `/oceano` en producción, con tsc, lint, suites y build
> en verde. Los tipos que necesite la UI se importan de su módulo de `lib/` con
> `import type`. Lo vigila **C14**.
>
> **PROMPT-2 (centralización de permisos):** toda Server Action empieza por
> `exigir("capacidad")`. El rol se lee SOLO de la cookie firmada (nunca de
> FormData/parámetros), y la matriz `rol → capacidades` vive en el módulo puro
> `lib/auth/permisos.ts`. `lib/auth/exigir.ts` es el ÚNICO sitio con I/O de
> sesión en el camino de autorización por capacidad.
>
> **PROMPT-3 (rol técnico, ejecutado 2026-09-06):** los roles son **5** (`alumno`,
> `maestro`, `directivo`, `tutor`, `tecnico`). El técnico es una fila normal de
> `PROFESORES` con `Permisos='Tecnico'` — no hay segundo camino de autenticación
> (R6). La UI gobierna con la MISMA `puede()` que el servidor (regla 4: un botón
> visible que el servidor rechaza es un bug). El recorte a directivo de la §4
> (configuración → técnico; lectura conservada) ya está aplicado en
> `lib/auth/permisos.ts` y verificado por `scripts/test-permisos.mjs`.
>
> **PROMPT-K (entrada validada, ejecutado 2026-09-20):** `exigir()` responde «este rol
> puede hacer esto», **no** «esto que ha llegado es lo que dice ser». El orden es
> **autorizar → validar → delegar**: ninguna action lee el `FormData` a mano —lo lee
> `leerFormData(esquema, formData)` de `lib/validacion/`, contra un esquema declarado— y
> los mensajes de error siguen siendo los de siempre, en castellano y para el usuario.
> Lo vigila la regla **C12** de `test-orden.mjs` (umbral 0). Pesaba más aquí que en otros
> repos: las policies de RLS son `USING (true)`, así que no hay una segunda red debajo.
| `lib/escolar/` | otros `lib/`, por ruta **relativa** | cualquier cosa de `app/`; el alias `@/` |
| `lib/*-puro.ts` | solo tipos | I/O de cualquier tipo |

### La prueba del algodón

> Si borras `app/` entero, `lib/` debe seguir teniendo sentido y compilar.

Cuando eso deja de ser cierto, hay lógica de negocio en la capa equivocada.

**Señal de error de capa:** una action con más de ~30 líneas que no sean validar
sesión, llamar a `lib/` y devolver. Si tiene un `if` de negocio, ese `if` va a `lib/`.

---

## 3. Orden de funciones

### Dónde va una función

| Si la función… | Va en |
|---|---|
| decide algo y **no** necesita base de datos | módulo puro en `lib/escolar/` — y **debe** tener suite en `scripts/test-*.mjs` |
| lee o escribe en Supabase | `lib/escolar/<dominio>.ts` |
| solo valida sesión y delega | `app/actions/<dominio>.ts` |
| solo transforma para pintar | junto al componente que la usa |
| la usan tres o más dominios | `lib/escolar/` con nombre genérico (`nombres.ts`, `fechas.ts`, `csv.ts`, `buscar-en-filas.ts`) |

### Nombres

| Prefijo | Significado | Ejemplo real |
|---|---|---|
| `action*` | Server Action, y solo eso | `actionConfirmarAsistencias` |
| `resolver*` | responde «¿cuál es el X de Y?», sin escribir | `resolverGrupoAlumno`, `resolverMateriasAlumno` |
| `validar*` | devuelve si algo es válido o el motivo | `validarAccesoProfesor`, `validarPesosActividades` |
| `calcular*` | cómputo puro | `calcularPromedioPonderado`, `calcularPorcentajeAsistencia` |
| `previsualizar*` / `analizar*` | **no escribe nada** | `previsualizarAsistencias` |
| `confirmar*` / `aplicar*` | **escribe** | `confirmarAsistencias`, `aplicarImportacionHorario` |
| `plan*` | devuelve un plan de cambios sin ejecutarlo | `planActivacionExclusiva`, `planRepararTablaLegacy` |
| `generar*` | produce un artefacto (XLSX, CSV, lista) | `generarPlantillaAsistencia` |
| `consultar*` / `listar*` | lectura | `consultarHorarioAlumno` |

> El par **`previsualizar` → `confirmar`** es obligatorio en todo flujo de importación.
> Si una función lleva `previsualizar` o `analizar` en el nombre y escribe, es un bug
> de contrato, no un detalle.

### Orden dentro del archivo

1. tipos exportados
2. constantes
3. funciones puras (las que se prueban)
4. funciones con I/O
5. helpers privados al final

---

## 4. Orden de scripts

Detalle completo e inventario: **`scripts/README.md`**. Aquí solo la regla de colocación.

| Prefijo | Contrato | Puede escribir |
|---|---|---|
| `test-*` | prueba un módulo puro; solo lee del filesystem | ❌ nunca |
| `diag-*` | mide el estado real; solo `GET` | ❌ nunca |
| `probe-*` | inspecciona esquema; solo `GET` | ❌ nunca |
| `p0-*` | herramienta de emergencia de ciclo | solo con `--apply` |
| `migrar-*` | migración de datos: dry-run por defecto, imprime el plan | solo con `--apply` |
| `gen-*` | genera un archivo del repo | archivos, no base de datos |

**Regla dura:** un script que escribe en la base **no puede** llamarse `test-`, `diag-`
ni `probe-`. Si escribe: o lleva guarda `--apply` con dry-run por defecto, o va a
`scripts/_peligrosos/`. Esta regla existe porque se violó: había `probe-*` que vaciaban
tablas.

| Carpeta | Qué guarda |
|---|---|
| `scripts/` | herramientas vivas y reutilizables |
| `scripts/_peligrosos/` | escriben o borran sin guarda. No ejecutar. |
| `scripts/_archivo/` | un solo uso ya consumido. No re-ejecutar. |

Todo script nuevo: cabecera con **qué mide**, **qué escribe** (o «nada») y **cómo se
ejecuta**, y una fila en `scripts/README.md`. Sin eso, no está terminado.

---

## 5. Orden de SQL

| Verbo | Cuándo | Ejemplo |
|---|---|---|
| `crear-` | objeto nuevo (tabla, RPC, trigger) | `crear-periodos-evaluacion.sql` |
| `agregar-` | columna o campo a algo existente | `agregar-periodo-id-calendario.sql` |
| `ampliar-` | ensanchar un dominio de valores | `ampliar-materias-15-aliases.sql` |
| `migrar-` | mover datos de una forma a otra | `migrar-asistencia-profesor.sql` |
| `limpiar-` | borrado acotado y justificado | `limpiar-etiquetas-personales.sql` |

### Reglas

- **Aditivo por defecto:** columnas nuevas nullable. Sin `DROP`, sin `NOT NULL`
  retroactivo, sin renombrar columnas en uso.
- **Un archivo, un propósito.** No agrupar cambios de dominios distintos.
- **Nada se borra de `supabase/`.** Cada `.sql` es la memoria del esquema, aunque ya esté
  aplicado. Es el único historial que hay.
- Todo cambio de esquema necesita su `.sql` versionado, aunque se haya aplicado a mano
  en el SQL Editor.
- La lógica que deba ser atómica o exclusiva va en **PL/pgSQL**, no en TypeScript:
  la exclusividad de ciclo la impone `activar_ciclo_operativo()`, no el código.

---

## 6. Orden de prompts

Regla base en `criterios.prompts`: pocos prompts, grandes, agrupados por dominio.
Aquí el ciclo de vida y el archivado.

### Estructura de un prompt

```
1. OBJETIVO        qué debe ser cierto al terminar (no cómo)
2. CONTEXTO        SOLO las rutas del presupuesto de docs/00-INDICE.md
3. MEDICIÓN        qué script de diagnóstico correr ANTES, y pegar el resultado
4. ALCANCE         qué SÍ y, explícito, qué NO tocar
5. CONTRATO        el bloque de 12 líneas de CONTRATO-DE-CAMBIO.md §1
```

### Economía de contexto

- **No pegar documentación en el prompt.** Citar la ruta: `docs/normativo/GLOSARIO.md`.
  El agente ya sabe leer. Pegar 40 KB en cada mensaje los paga en cada turno.
- **Un prompt, un dominio.** Cruzar dominios multiplica el contexto necesario y hace
  imposible auditar el resultado.
- **Nombrar los términos del glosario tal cual.** Decir `periodos.id`, no «el ciclo»;
  `idInterno`, no «el nombre de la materia». La ambigüedad se paga en re-trabajo.
- **Exigir la medición antes que el código.** Un prompt que no pide medir produce un
  cambio que no se puede auditar.

### Ciclo de vida

| Momento | Dónde vive |
|---|---|
| Se redacta | fuera del repo, o directo en el chat |
| Se ejecuta | Cline implementa |
| Se acepta | checklist de `CONTRATO-DE-CAMBIO.md` |
| Se archiva | el prompt a `docs/historial/prompts/`, el informe a `docs/historial/informes/` |
| Cambia el estado del sistema | se actualiza `ESTADO-ACTUAL.md` — **este paso es el que se olvida** |

Un prompt archivado sirve de plantilla para el siguiente. Por eso se guardan tal cual
se enviaron, sin limpiar.

---

## Cómo se rompe este orden

Las cuatro formas reales, por frecuencia:

1. **Lógica que sube a la action** porque «era solo un `if`». Se detecta con la prueba
   del algodón de §2.
2. **Un archivo nuevo en la raíz** porque no se supo dónde ponerlo. La tabla de §1
   siempre tiene una fila; si de verdad no la tiene, el concepto está mal planteado.
3. **Un script que escribe con nombre de solo lectura.** §4, regla dura.
4. **Documentación que no se actualiza** cuando el código la vuelve falsa. Por eso
   `ESTADO-ACTUAL.md` es corto: lo largo no se mantiene.
