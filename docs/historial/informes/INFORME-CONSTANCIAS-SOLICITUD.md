# INFORME — Constancias de estudios: solicitud desde el perfil y emisión directa

**Fecha:** 2026-09-25 · **Rama:** `feature/constancias-solicitud` → `main` · **Ejecutado por:** Claude

## Lo pedido

1. En el perfil de **alumno y tutor**, el sistema de citas aplicado a la constancia de estudios:
   **asunto, motivo y día para recogerla**.
2. **Solo Administración escolar** la acepta.
3. **Dirección** solo la saca directamente, con la **CURP** del alumno.

## Cómo quedó

| Quién | Dónde | Qué hace |
|---|---|---|
| Alumno · tutor | Perfil › **Constancias de estudios** (justo después de Sesiones programadas) | pide con asunto, motivo y día; ve el estado de las suyas: en revisión, aceptada («pasa a recogerla el …»), rechazada, entregada |
| Administración escolar | Trámites escolares › Constancias › **Solicitudes** | ve a quién, asunto, motivo, día de recogida y quién la pidió; **acepta o rechaza**, y la marca como entregada |
| Dirección | Administración escolar › **Recursos administrativos** | escribe la CURP y obtiene la constancia oficial para imprimir; ya no ve ni atiende solicitudes |

El panel del alumno reproduce el de citas: misma forma, misma tabla para las dos vistas (la de
quien pide y la de quien acepta) y el alcance resuelto en el servidor. El alumno ve las suyas; el
tutor, las de sus vinculados. Toda llamada maneja su error.

**Día para recogerla** (`validarFechaRecogida`, puro): a partir de mañana, de lunes a viernes y a
60 días como mucho. El selector de fecha ya empieza en mañana.

## Esquema

`supabase/agregar-solicitud-constancia-estudios.sql`, **aplicado dos veces sin error**: `asunto`,
`motivo`, `fecha_recogida`, `solicitada_por` (alumno/tutor, con CHECK) y `solicitante` en
`solicitudes_constancia`. Son columnas nullables y la tabla tenía 0 filas. `tipo` sigue siendo
obligatorio: la app escribe «estudios».

## Permisos

| Capacidad | Antes | Ahora |
|---|---|---|
| `constancia.gestionar` (aceptar/rechazar/entregar) | Dirección y Administración escolar | **solo Administración escolar** |
| `constancia.emitir` (nueva) | — | Dirección y Administración escolar |
| `constancia.ver_propias` (nueva) | — | alumno y tutor |
| `constancia.solicitar` | alumno y tutor | sin cambio (ahora con pantalla) |

`actionSolicitarConstancia` ya existía, pero ninguna pantalla la usaba. Se reescribió con entrada
validada (`leerEntrada`) y los campos nuevos. Nuevas: `actionListarConstanciasPropias` y
`actionDatosConstanciaPorCurp`. `actionListarConstancias` ahora devuelve también el nombre del
alumno.

## Pruebas

| Qué | Resultado |
|---|---|
| `test-permisos` (incluye «constancia.gestionar es SOLO de Administración escolar») | **709/0** |
| `test-rediseno-oceano` (apartado en alumno y tutor, junto a Sesiones; Dirección monta la constancia directa y ya no las solicitudes) | **440/440** |
| `test-uis-pendientes` (+ día de recogida: sábado, mismo día, pasado, 60 días, 30 de febrero, formato) | **101/101** |
| Base real con el código de `lib/`: solicitar, alcance, «no se entrega sin aceptar», aceptar, entregar, nombre, datos por CURP de una alumna real, CURP inexistente | **11/11**, limpieza verificada (0 solicitudes antes y después) |

`tsc` 0 · `eslint` 0 · `test-orden` 15 reglas · `test:ci` 41/41 · auditoría · `gen:matriz --check` ·
`verificar-docs` · `build`.
