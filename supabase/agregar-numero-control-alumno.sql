-- ============================================================================
-- NÚMERO DE CONTROL DEL ALUMNO (2026-09-24)
-- Proyecto: mi-web-escolar (AulaNube / CETAC 23)
--
-- El número de control (o matrícula) que la escuela asigna a cada alumno y que
-- va impreso en la constancia de estudios («con el número de control
-- 23222040230009»). No existía en ninguna tabla.
--
-- Es un dato CONSTANTE del alumno, no una etiqueta dinámica: una columna de
-- ALUMNOS. ÚNICO cuando existe, así que identifica al alumno igual que la CURP
-- y puede usarse como su identificador institucional. Nulo mientras nadie lo
-- capture: la columna es aditiva y ningún alumno existente se toca.
--
-- Lo editan quienes tengan `alumno.editar_numero_control` (Administración
-- escolar), desde «Alumnos › Datos personales». El formato lo valida la app
-- (`numero-control-puro.ts`) y, como segunda red, el CHECK de abajo.
--
-- ADITIVO e idempotente: se puede ejecutar dos veces sin error.
-- ============================================================================

alter table "ALUMNOS" add column if not exists numero_control text;

-- Único solo entre los que tienen valor: los nulos no chocan entre sí.
create unique index if not exists alumnos_numero_control_unico
  on "ALUMNOS" (numero_control)
  where numero_control is not null;

-- Mayúsculas y dígitos, de 4 a 20 caracteres (guion permitido). La app normaliza
-- antes de guardar (quita espacios, pasa a mayúsculas); esto impide que otro
-- camino —un script, el SQL Editor— guarde algo que la constancia no pueda imprimir.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'alumnos_numero_control_formato'
  ) then
    alter table "ALUMNOS"
      add constraint alumnos_numero_control_formato
      check (numero_control is null or numero_control ~ '^[A-Z0-9-]{4,20}$');
  end if;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFICACIÓN:
--   select "CURP", numero_control from "ALUMNOS" where numero_control is not null;
-- ============================================================================
