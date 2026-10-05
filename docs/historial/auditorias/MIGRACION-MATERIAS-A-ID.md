# Migración de materias legacy a `materias.id` — opciones

Medido el **2026-09-30** contra la base de producción con
`scripts/probe-forma-materias.mjs` y `scripts/probe-datos-legacy-materias.mjs`.
No es una propuesta sobre lo que los documentos dicen que hay: es sobre lo que
hay.

---

## 1. El hallazgo que cambia el problema

La deuda nº3 —«una tabla física por materia»— se describe como la más dura de
las tres. Medida, resulta ser **casi toda cáscara**:

```
tablas físicas referenciadas en grupo_materias.tabla_legacy ... 241
   con datos ....  1
   vacías ...... 240
   no existen ...  0
```

**Una sola tabla tiene filas.** `5TOMCAMAT010`, 57 filas, 12 columnas — y
pertenece a la materia `RECURSO` del catálogo (`4a4a73e7`), que tiene pinta de
ser un marcador de pruebas más que una asignatura real.

Esto reencuadra todo: **no es una migración de datos, es una migración de
código.** Lo que hay que mover son 57 filas; lo que hay que cambiar es por
dónde lee el sistema.

## 2. Lo que YA existe y está bien

Buena parte de lo que pides está construido:

| Pides | Ya existe |
|---|---|
| identificador en vez de ruta absoluta | **`materias.id`** (uuid), 15 filas, limpio |
| estado de materia (activar/desactivar) | `materias.activo` **y** `grupo_materias.activo` |
| identificador de grupo, grado y carrera | `grupos.id` con `grado`, `carrera_id`, `periodo_id`, `activo` |
| expandir / reducir volumen por alumno | `grupo_materias` (253 filas) + `inscripciones_alumno` (454) |
| calificaciones por actividad | `actividades` + `actividad_entregas` — creadas, **0 filas**, sin usar |

El catálogo normalizado **no hay que construirlo**. Existe y funciona.

## 3. El problema real: dos identidades bajo el mismo nombre de columna

Aquí está la deuda de verdad, y no estaba documentada:

```
grupo_materias.materia_id          → uuid → materias.id        ✅ correcto
materias_nombres_visibles.materia_id → TEXTO → "1ROAMAT011"    ❌ es el nombre de tabla
materias_mapeo_columnas.materia_id   → TEXTO → "5TOMCAMAT010"  ❌ idem
```

**Cero de 101 filas de `materias_nombres_visibles` apuntan a `materias.id`.**
La columna se llama `materia_id` en los tres sitios y significa dos cosas
distintas. Un `join` entre ellas no falla: **devuelve vacío**, que es peor.

Y un detalle que importa para el diseño: las 101 filas de alias son **una por
pareja (grupo, materia)**, no una por materia. «Taller deportivo» de 1RO A y de
1RO B son dos filas. Así que el alias **no es un atributo de la materia**: es un
atributo de la materia *en ese grupo*.

## 4. El obstáculo de los datos que sí hay

`5TOMCAMAT010` tiene esta forma:

```
id · alumno_nombre · "Col 2" · Actividad 1 - Lectura y comprensión · … (8 actividades) · Evaluación final
```

Dos problemas:

- **No hay CURP.** Solo `alumno_nombre`. Cualquier modelo normalizado necesita
  la identidad del alumno, y resolver nombre→CURP sobre 57 filas es
  exactamente el tipo de cosa que mete datos en el alumno equivocado.
- Las calificaciones son **texto** (`"90.0"`), y el nombre de la actividad es el
  nombre de la columna.

---

## Opción A · Solo el puente: arreglar las dos identidades

**Qué se hace:** añadir a `materias_nombres_visibles` y
`materias_mapeo_columnas` una columna `grupo_materia_id` (uuid, FK a
`grupo_materias.id`), rellenarla desde `tabla_legacy`, y mover el código a leer
por ahí. La columna `materia_id` de texto se queda (R8) y deja de escribirse.

**No se toca** ninguna tabla física ni se mueven las 57 filas.

| | |
|---|---|
| **Coste** | Bajo. Dos columnas, un backfill de 103 filas, y el código de lectura |
| **Riesgo** | Bajo. Aditivo y reversible. Nada deja de funcionar |
| **Qué resuelve** | La identidad partida, que es la deuda real |
| **Qué NO resuelve** | Las calificaciones siguen en tablas físicas. El alumno sigue dependiendo de `tabla_legacy` para ver sus notas |

Es el paso que la retroalimentación pide —«primero termina la migración
funcional y demuestra que el catálogo nuevo es estable»— y **el único que no
necesita decidir nada más**.

---

## Opción B · Puente + calificaciones normalizadas (la que recomiendo)

**Qué se hace:** todo lo de A, más una tabla de calificaciones normalizada:

```sql
calificaciones (
  id              uuid primary key,
  grupo_materia_id uuid → grupo_materias.id,   -- grupo + materia + periodo
  curp            text,                         -- identidad del alumno
  actividad_id    uuid → actividades.id NULL,   -- null = promedio/final
  tipo            text check (tipo in ('actividad','parcial','promedio','final')),
  valor           numeric(5,2),
  registrado_por  bigint,                       -- PROFESORES.ID
  created_at      timestamptz,
  unique (grupo_materia_id, curp, actividad_id, tipo)
)
```

Con esto el flujo que describes queda entero:

```
técnico    → grupo_materias (alta/baja/activo) e inscripciones_alumno
profesor   → sube su Excel; cada columna reconocida escribe filas de
             `calificaciones` con su grupo_materia_id y su curp
alumno     → ve SOLO lo suyo: where curp = <el de su sesión>
```

Y «expandir o reducir volumen de materias» deja de ser crear o borrar tablas:
es **insertar o desactivar filas** en `grupo_materias`.

| | |
|---|---|
| **Coste** | Medio. Una tabla, el cableado del sistema de subida, y adaptar las vistas del alumno |
| **Riesgo** | Medio, **pero acotado**: las 240 tablas vacías no se migran porque no hay nada que migrar. Solo `5TOMCAMAT010` |
| **Qué resuelve** | El modelo entero que pides, y deja las físicas sin lectores nuevos |
| **La decisión que exige** | Qué hacer con las 57 filas sin CURP (ver §5) |

**Reutiliza `actividades`** —que creé para las UIs pendientes y está vacía— en
vez de inventar otra tabla de actividades. Esa es la diferencia entre normalizar
y añadir una capa más.

---

## Opción C · Reescritura completa del modelo académico

`materias` · `actividades` · `evaluaciones` · `calificaciones`, con
`materia_id` + `alumno_id` + `periodo_id`, y retirar `tabla_legacy` del sistema.

| | |
|---|---|
| **Coste** | Alto. Toca asistencia, horario, boletas, el configurador y las 45 suites |
| **Riesgo** | **Alto, y sin red**: no hay staging, y `asignaciones_profesor` sigue en 0 filas — se reescribiría encima de código que nunca se ha estrenado |
| **Qué resuelve** | Es la arquitectura que la retroalimentación describe como destino |

**No la recomiendo ahora**, y la propia retroalimentación lo dice: *«No
recomiendo hacerlo ahora indiscriminadamente. Primero termina la migración
funcional y demuestra que el catálogo nuevo es estable.»* Además introduciría
`alumno_id` donde hoy la identidad es **CURP**, y cambiar la identidad del
alumno en mitad de esto abriría una cuarta deuda estructural.

---

## 5. La decisión que cualquier opción con datos exige

Las 57 filas de `5TOMCAMAT010` tienen `alumno_nombre` y **no CURP**. Tres
salidas:

1. **No migrarlas.** La tabla se queda como está, de solo lectura, y lo nuevo
   nace vacío. Es lo más seguro y lo que menos promete.
2. **Resolver nombre→CURP contra `ALUMNOS`**, con un previsualizar→confirmar que
   enseñe cada pareja y exija confirmación de las ambiguas. Es el patrón que el
   repo ya usa en todas sus importaciones.
3. **Migrar sin CURP**, dejando la columna nula y el nombre en un campo de
   texto. **No lo recomiendo**: una calificación que no se puede atribuir a un
   alumno no sirve para nada, y ensucia la tabla nueva desde el primer día.

La 2 es la correcta si esas 57 filas importan. Si son de prueba —y la materia
`RECURSO` lo sugiere— la 1 es más honesta.

---

## 6. Lo que yo haría

**Opción B, en dos prompts separados:**

1. **El puente** (= Opción A). Aditivo, sin datos, verificable: al terminar,
   `materias_nombres_visibles` y `materias_mapeo_columnas` se leen por
   `grupo_materia_id` y el `join` con `materias` devuelve filas. Peso: esquema,
   así que lo diseño yo.
2. **Las calificaciones.** Tabla nueva + cableado del sistema de subida + vista
   del alumno por su CURP. Con la decisión de §5 ya tomada.

Y **antes de los dos**, una comprobación que cuesta diez minutos y puede
ahorrar el trabajo entero: confirmar que `5TOMCAMAT010` y la materia `RECURSO`
son datos de prueba. Si lo son, §5 se resuelve con la salida 1 y la migración
pierde su única pieza delicada.

## 7. Lo que NO propongo tocar

- **`tabla_legacy` no se borra** (R8). Deja de tener lectores nuevos; eso es
  suficiente.
- **La identidad del alumno sigue siendo CURP.** Introducir `alumno_id` es otra
  migración y otra deuda.
- **Las 240 tablas vacías no se tocan.** Borrarlas es cosmética con riesgo, y no
  estorban a nada.
