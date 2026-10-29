-- Migracion 003 - Correo unico por empleado
-- Municipalidad de Jalapa
--
-- El correo identifica a la persona: si dos expedientes lo comparten no se sabe
-- a quien corresponde una notificacion o una constancia. Hasta ahora nada lo
-- impedia, ni en la aplicacion ni en la base.
--
-- Esta migracion hace tres cosas, en orden:
--   1. Normaliza los correos existentes (sin espacios, en minusculas) y
--      convierte los vacios en NULL.
--   2. Libera los duplicados: conserva el correo en el expediente MAS ANTIGUO
--      (el de menor id) y deja vacio el de los demas, para que RRHH les asigne
--      el suyo desde la pantalla Empleados. No se borra ningun otro dato.
--   3. Crea el indice unico que impide que vuelva a ocurrir.
--
-- Es idempotente: se puede reejecutar sin efecto adicional.
--
--   psql -U postgres -d municipalidad_rrhh -f database/migrations/003_correo_unico_empleados.sql

BEGIN;

-- 1. Normalizacion -----------------------------------------------------------

UPDATE empleados
   SET correo = NULLIF(LOWER(TRIM(correo)), '')
 WHERE correo IS DISTINCT FROM NULLIF(LOWER(TRIM(correo)), '');

-- 2. Liberacion de duplicados ------------------------------------------------
-- Se deja constancia en una tabla temporal para poder mostrar el resultado
-- antes de confirmar la transaccion.

CREATE TEMP TABLE correos_liberados ON COMMIT DROP AS
WITH numerados AS (
  SELECT id,
         correo,
         codigo_empleado,
         nombres || ' ' || apellidos AS nombre_completo,
         ROW_NUMBER() OVER (PARTITION BY correo ORDER BY id) AS posicion
    FROM empleados
   WHERE correo IS NOT NULL
)
SELECT id, correo, codigo_empleado, nombre_completo
  FROM numerados
 WHERE posicion > 1;

UPDATE empleados e
   SET correo = NULL
  FROM correos_liberados c
 WHERE e.id = c.id;

-- Muestra que expedientes quedaron pendientes de correo.
SELECT codigo_empleado AS "Codigo",
       nombre_completo AS "Empleado",
       correo          AS "Correo liberado (reasignar en la pantalla Empleados)"
  FROM correos_liberados
 ORDER BY id;

-- 3. Restriccion -------------------------------------------------------------
-- Sobre LOWER(TRIM(...)) para que "Juan@Muni.gob.gt" y "juan@muni.gob.gt" sean
-- el mismo valor. Los NULL no chocan entre si, asi que varios empleados pueden
-- quedar sin correo.

CREATE UNIQUE INDEX IF NOT EXISTS empleados_correo_unico
    ON empleados (LOWER(TRIM(correo)))
 WHERE correo IS NOT NULL;

COMMENT ON INDEX empleados_correo_unico IS
  'El correo identifica a la persona: no puede repetirse entre expedientes.';

COMMIT;
