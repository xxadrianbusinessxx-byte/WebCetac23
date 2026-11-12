-- ============================================================================
-- ALUMNO DE PRUEBA — perfiles de visualización (2026-11-12, PROMPT AC)
-- Proyecto: mi-web-escolar (AulaNube / CETAC 23)
--
-- Para ver el portal como lo ve un alumno y su tutor hace falta un alumno que
-- no sea una persona: uno ficticio, inscrito en un grupo REAL (así ve horario,
-- materias y calendario de verdad), y con su tutor. Profesor, técnico,
-- Administración escolar y Servicio Escolar ya tienen su cuenta genérica en
-- PROFESORES; alumno y tutor no viven ahí, así que no basta una fila más.
--
-- `es_prueba` marca a ese alumno para que NO aparezca donde el personal real
-- trabaja con listas: padrón del ciclo y sus descargas, Datos incompletos,
-- plantillas de asistencia, boletas por grupo y padrón de calificaciones. El
-- filtro lo aplica la app (`lib/escolar/alumno/alumnos-prueba.ts`); esta
-- columna es la ÚNICA fuente de verdad de quién es de prueba (R6): ni un CURP
-- reservado en el código ni un nombre convenido.
--
-- ADITIVO e idempotente: ningún alumno existente cambia (todos quedan en false).
-- ============================================================================

-- PASO 1 — la columna. Aplicar ANTES de desplegar el código del PROMPT AC (el
-- código tolera que falte: sin columna, nadie es de prueba). Nullable, como
-- pide el CONTRATO §2 para toda columna nueva: la app solo pregunta por
-- `es_prueba = true`, así que nulo y false significan lo mismo.
alter table "ALUMNOS"
  add column if not exists es_prueba boolean default false;

-- Índice parcial: la app solo pregunta «¿quiénes son de prueba?», y son 1 o 2.
create index if not exists alumnos_es_prueba
  on "ALUMNOS" ("CURP")
  where es_prueba;

-- PASO 2 — NO es SQL: con el código ya desplegado, el técnico da de alta al
-- alumno desde Personas › Alumnos › Alta manual (PROMPT W). Eso crea, en un
-- solo paso, la fila de ALUMNOS, su inscripción en el grupo elegido y su tutor.
--   · Nombre sugerido: NOMBRE 'ALUMNO', apellidos 'DE PRUEBA'.
--   · CURP: una INVENTADA con formato válido. NO la escribas en el repo ni en
--     un chat: la clave del alumno son sus últimos 6 caracteres y la contraseña
--     inicial del tutor también sale de ella.

-- PASO 3 — marcarlo. Sustituir <CURP> por la CURP inventada del paso 2 y
-- ejecutar. Debe decir «UPDATE 1». Si dice 0, la CURP no coincide: no repetir
-- con otro filtro, revisar el alta.
-- update "ALUMNOS" set es_prueba = true where "CURP" = upper('<CURP>');

-- Verificación (debe devolver exactamente el alumno de prueba):
-- select "CURP", "NOMBRE", "P_APELLIDO", es_prueba from "ALUMNOS" where es_prueba;
