# INFORME — UIs pendientes (rama `feature/uis-pendientes`, 2026-09-17)

Cierra las pantallas que el diseño Océano dibujaba y el sistema no soportaba, y
retira la interfaz antigua. Tres commits desde `4307186`:
**47 archivos · +3 384 / −4 179 líneas · 15 nuevos · 9 borrados.**

---

## 1. Resultado

| | antes | después |
|---|---|---|
| Apartados activos | 40 | **56** |
| Maquetas (se ven, no operan) | 6 | **0** |
| Apagados | 10 | **3** |
| Suites | 38 | **39** |
| Capacidades | 64 | **78** |
| `test-permisos` | 475 | **545** |
| Server Actions auditadas | 147 | **170** |

Los 3 apagados que quedan **no son deuda**: `chat/chat` en alumno y tutor lo
descartaste explícitamente, y `contenido/noticias` depende de Cloudinary, que
está desactivado. Ninguno es «falta hacerlo».

---

## 2. Lo primero: dos cosas que había clasificado mal

El plan aprobado decía que **Actividades** y **Reportes** eran «cero SQL».
Al ir a construirlas resultó que no, y conviene que quede escrito:

- **Actividades** no era el promedio ponderado que supuse. Vi
  `pesos_actividades` en el esquema y encadené dos cosas que se parecen de
  nombre: esa columna pondera columnas de calificación **ya existentes**, y
  además tiene **0 filas** (solo 2 materias de 384 tienen mapeo configurado).
  El diseño pide **tareas**: plazo, peso, descripción, archivos y entrega.
- **Reportes** no son estadísticas. Son **reportes disciplinarios**: alumno,
  motivo, fecha, gravedad, «Anular». No se derivan de nada existente.

Por eso se leyeron **las seis maquetas de una vez** antes de escribir una línea,
en vez de descubrirlo a trozos.

---

## 3. Base de datos

Dos archivos versionados en `supabase/`, ambos **aditivos e idempotentes**:
ni un `DROP`, ni un `DELETE`, ni una migración de datos.

### `crear-tablas-uis-pendientes.sql` — 7 tablas

| Tabla | Pantalla | Claves |
|---|---|---|
| `actividades` | Materias › Actividades | `periodo_id` → `periodos.id`, `grupo_materia_id`, `materia_interna` (idInterno) |
| `actividad_entregas` | ídem, lado del alumno | `actividad_id` + `curp`, **único** |
| `reportes_alumno` | Administración › Reportes | `periodo_id`, `curp`, `grupo_id` |
| `citas` | Citas **y** Sesiones programadas | `periodo_id`, `curp`, `estado` |
| `solicitudes_constancia` | Recursos administrativos | `periodo_id`, `curp`, `estado` |
| `buzon_mensajes` | Buzón | `periodo_id`, `curp` **nullable** |
| `mensajes_internos` | Mensajes (personal) | `hilo_id`, `de_profesor`, `para_profesor` |

### `agregar-materia-carpetas.sql` — una columna

`CARPETAS.materia_interna` (nullable) + índice parcial. Las 9 carpetas
existentes quedan en `NULL`, así que **ninguna cambia de significado**.

### Identidades, como manda el GLOSARIO

Ciclo por **`periodos.id`**, nunca por nombre (R5). Alumno por **CURP**.
Profesor por **`PROFESORES.ID`**, nunca por `CLAVE`.

Las columnas de profesor van **sin FK** a propósito: apuntar a `PROFESORES` es
tocar una tabla con la identidad rota (deuda estructural nº2) y estos archivos
no reparan deudas ajenas. La integridad la sostiene TypeScript, como el resto.

### Cinco decisiones de esquema que conviene conocer

1. **El estado de una actividad no se guarda.** `ACTIVA` / `VENCIDA` se
   **deriva** de `fecha_limite` contra el momento en que se mira. Guardarlo
   obligaría a un proceso que lo refresque, y entre dos pasadas de ese proceso
   el dato mentiría.
2. **Un reporte anulado no se borra** (`anulado_at`). Es el historial del
   alumno; borrarlo lo destruiría.
3. **Citas y Sesiones programadas son UNA tabla.** El directivo resuelve, el
   alumno y su tutor consultan. Dos tablas habrían sido dos fuentes del mismo
   dato (R6).
4. **El buzón NO reutiliza `COMENTARIOS`.** Aquella tabla son comentarios
   *sobre* un alumno escritos por el personal; esto son mensajes *de* alumnos y
   tutores hacia la dirección. Mismo nombre, sentido contrario.
5. **Recursos NO es un sistema nuevo.** Es Documentos con otro ámbito, y se
   resolvió con una columna en vez de abrir un camino paralelo a
   `CARPETAS`/`DOCUMENTOS`/`PERMISOS CARPETAS`.

### RLS

Permisiva (`using (true)`), **igual que el resto del sistema**. La autorización
real vive en TypeScript (`exigir()`). Es una decisión ya tomada y documentada en
`ESTADO-ACTUAL` §4; estas tablas no la cambian ni inventan un segundo modelo.

---

## 4. El flujo, de la pantalla a la base

Cuatro capas, y cada una decide **una** cosa:

```
app/components/<x>-panel.tsx      UI. No decide permisos ni alcance.
        ↓
app/actions/<dominio>.ts          exigir(capacidad) → ALCANCE → delegar
        ↓
lib/escolar/<familia>/<dom>.ts    I/O. Recibe el cliente por parámetro.
        ↓                         (la DECISIÓN pura sale a `<dom>-puro.ts`)
Supabase
```

**Ninguna de las tres actions nuevas tiene un solo `.from()`**, así que C8 de
`test-orden` sigue en 0.

### Qué se escribió

| Capa | Archivos |
|---|---|
| Puro | `administracion/flujos-puro.ts`, `materia/actividades-puro.ts` |
| I/O | `administracion/administracion.ts`, `materia/actividades.ts`, `mensajes-internos.ts` |
| Actions | `administracion.ts`, `actividades.ts`, `mensajes-internos.ts` |
| UI | `administracion-panel.tsx`, `actividades-panel.tsx`, `sesiones-programadas-panel.tsx`, `mensajes-internos-panel.tsx` |

### El alcance, que es lo delicado

La capacidad dice **qué**; nunca **sobre quién**. Eso se resuelve en la action:

- **El alumno entrega con la CURP de su sesión**, nunca con una que llegue por
  parámetro. Es la diferencia entre «entrego mi tarea» y «entrego a nombre de
  quien yo diga».
- **El tutor pide cita solo para sus vinculados**: la CURP pedida se comprueba
  contra `listarCurpsDeTutor`.
- **El destinatario de un mensaje se valida** contra la lista que calcula el
  servidor. Sin eso, `para_profesor` sería un número libre venido del cliente.
- **Un tutor no arrastra entregas**: ve las actividades de su vinculado, pero
  las entregas solo se cargan si quien mira es el alumno.

### Permisos

14 capacidades nuevas en la lista cerrada, en la matriz y en la §4 (64 → 78
filas). `test-permisos` sube de **475 a 545** comprobaciones — 70 más, que es
14 × 5 roles: la señal de que la matriz las está verificando de verdad.

---

## 5. La UI antigua, retirada

**Con prueba de cobertura antes de borrar**, no por impresión: se recorrieron
los imports de cada ruta retirada y se compararon con lo que alcanza `/oceano`.
Lo único que las cinco rutas montaban y el portal no alcanza son las dos
decoraciones Frutiger — que es exactamente lo que el rediseño sustituye.

Borrado (9 archivos):

- Los cinco `*-client.tsx` legacy: `perfil`, `profesor`, `directivo`, `tutor`,
  `configuracion` (**3 288 líneas**).
- `documentos-client.tsx`, que era solo el cromo antiguo envolviendo el panel.
- **`maquetas-oceano.tsx` entero.** Sus cinco pantallas ya operan, así que
  dibujarlas sin datos dejó de tener sentido.
- La barra de navegación legacy y su píldora, que llevaban semanas sin
  dibujarse en ninguna ruta viva: devolvían `null` en `/`, `/login` y
  `/oceano`, y todo lo demás ya redirigía.

De paso cae una **consulta a la base que el layout hacía en cada carga** solo
para alimentar esa barra.

### Lo que NO se borró, y por qué

El **mecanismo de maqueta** (`maq`, `TEXTO_MAQUETA`) se conserva y se exporta.
Hoy no hay ninguna, pero la habrá el día que se dibuje un frame antes de tener
su backend; borrarlo obligaría a reinventarlo.

---

## 6. Aserciones actualizadas

Trece aserciones decían «esto es maqueta» o «esto está apagado». Dejaron de ser
ciertas **porque el trabajo se hizo**, no porque estorbaran: se reescriben
afirmando lo nuevo y añadiendo que cada pantalla tiene pieza.

Una es de otra clase y se marca como tal: `test-auditoria-ciclo-f2` leía
`configuracion-client.tsx`. Ahí cambia la **ruta**, no el invariante — el
consumidor externo al wizard se mudó a `roster-alumnos-panel.tsx`, que salió de
ese mismo cliente.

`contenido-alumno.ts` entra por fin en la suite, así que su mapa hueco→pieza
gana la verificación que ya tenían docente, directivo y técnico.

**Suite nueva**: `test-uis-pendientes.mjs`, **62 verificaciones**. Las que más
valen prohíben un salto: una cita `pendiente` no puede pasar a `finalizada` sin
aceptarse, y una constancia no se entrega sin aprobarse.

---

## 7. Validación

```
tsc --noEmit ............ 0          test-rediseno-oceano ... 335/335
test:suites ............. 39/39      test-uis-pendientes .... 62/62
test:permisos ........... 545        auditoría .............. 170 actions, 269 ✓
gen:matriz --check ...... exit 0     test-orden ............. 10/10, C8 y C9 en 0
lint .................... 0 errores  build .................. 9 rutas
```

---

## 8. Pendiente, y una cosa que hay que hacer ya

1. **Rotar la contraseña de Supabase.** Se pasó por chat para este trabajo y
   queda en ese historial. Ya estaba en `pendientes.json` como riesgo **alto**;
   esto lo hace concreto.
2. **Nada de esto se ha probado con datos reales.** Las siete tablas están
   vacías: la validación es de tipos, suites puras y build. Falta entrar con
   una sesión de cada rol y ejercer los flujos.
3. **`gen-seccion4.mjs` no descubre capacidades nuevas**: itera sobre la tabla
   que ya está en el documento, así que una capacidad recién creada no aparece
   sola — hubo que añadir las 14 filas a mano antes de regenerar. Es un hueco
   real de esa herramienta.
4. **`test-auditoria-permisos` tiene el falso positivo del comentario**: busca
   comparaciones de rol en texto plano, comentarios incluidos, y marcó un
   comentario mío. `test-orden.mjs` ya resuelve esa clase de problema
   neutralizando comentarios y literales; convendría aplicarlo allí.
5. `materias/recursos` del alumno usa la materia seleccionada; si no hay
   ninguna abierta, muestra las carpetas institucionales. Es razonable pero es
   una decisión, no una necesidad.
