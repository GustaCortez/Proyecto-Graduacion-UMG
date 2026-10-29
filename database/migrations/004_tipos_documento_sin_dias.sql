-- Migracion 004 - Distinguir tramites de documento de ausencias reales
-- Municipalidad de Jalapa
--
-- Hasta ahora TODA solicitud pedia un rango de fechas y calculaba dias habiles,
-- aunque no hubiera ausencia alguna. Una constancia laboral o una constancia de
-- ingresos son un papel que RRHH extiende: el trabajador no deja de asistir, asi
-- que no tiene sentido pedirle "del 17 de septiembre al 18 de octubre" ni
-- anotarle 22 dias habiles.
--
-- Se agrega `es_ausencia`:
--   TRUE  -> el empleado NO asiste: se pide un rango y se cuentan dias habiles
--            (vacaciones, permisos, suspension).
--   FALSE -> tramite de documento o registro administrativo: una sola fecha, la
--            de la solicitud, y cero dias (constancias, carnet, alta y baja).
--
-- Solo Vacaciones descuenta saldo, y eso no cambia.
--
-- Es idempotente: se puede reejecutar sin efecto adicional.
--
--   psql -U postgres -d municipalidad_rrhh -f database/migrations/004_tipos_documento_sin_dias.sql

BEGIN;

-- 1. La columna -------------------------------------------------------------
-- Por omision TRUE: un tipo nuevo se comporta como hasta ahora, y quien lo cree
-- decide si es un documento.

ALTER TABLE tipos_solicitud
  ADD COLUMN IF NOT EXISTS es_ausencia BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN tipos_solicitud.es_ausencia IS
  'TRUE: el empleado se ausenta, se pide rango de fechas y se cuentan dias habiles. '
  'FALSE: tramite de documento o registro administrativo, una sola fecha y cero dias.';

-- 2. Clasificacion de los tipos existentes ----------------------------------
-- Por nombre y no por id, para que funcione en cualquier instalacion.

UPDATE tipos_solicitud
   SET es_ausencia = FALSE
 WHERE nombre ILIKE 'constancia%'        -- Constancia laboral, Constancia de ingresos
    OR nombre ILIKE 'carnet%'            -- Carnet IRTRA
    OR nombre ILIKE 'alta de empleado'   -- registro de ingreso
    OR nombre ILIKE 'baja de empleado';  -- registro de salida

UPDATE tipos_solicitud
   SET es_ausencia = TRUE
 WHERE nombre ILIKE 'vacaciones'
    OR nombre ILIKE 'permiso%'
    OR nombre ILIKE 'suspension%';

SELECT nombre     AS "Tipo de solicitud",
       CASE WHEN es_ausencia THEN 'Ausencia (rango y dias habiles)'
            ELSE 'Documento (una sola fecha)' END AS "Comportamiento",
       activo     AS "Activo"
  FROM tipos_solicitud
 ORDER BY es_ausencia DESC, nombre;

-- 3. Correccion de las solicitudes ya registradas ---------------------------
-- Las constancias emitidas quedaron con fecha fin y dias habiles que nunca
-- debieron tener. Ninguna descuenta saldo (dias_descontados = 0), asi que
-- limpiarlas no altera las vacaciones de nadie; solo deja de mostrar dias en un
-- tramite que no los consume. La fecha de inicio se conserva: es la fecha en que
-- se pidio el documento.

CREATE TEMP TABLE solicitudes_corregidas ON COMMIT DROP AS
SELECT s.id, t.nombre AS tipo, s.dias_habiles, s.fecha_fin
  FROM solicitudes s
  JOIN tipos_solicitud t ON t.id = s.id_tipo
 WHERE t.es_ausencia = FALSE
   AND (s.fecha_fin IS NOT NULL
        OR COALESCE(s.dias_habiles, 0) <> 0
        OR COALESCE(s.dias_solicitados, 0) <> 0);

UPDATE solicitudes s
   SET fecha_fin        = NULL,
       dias_solicitados = 0,
       dias_habiles     = 0
  FROM solicitudes_corregidas c
 WHERE s.id = c.id;

SELECT id           AS "Solicitud",
       tipo         AS "Tipo",
       dias_habiles AS "Dias que tenia (ahora 0)",
       fecha_fin    AS "Fecha fin que tenia (ahora vacia)"
  FROM solicitudes_corregidas
 ORDER BY id;

COMMIT;
