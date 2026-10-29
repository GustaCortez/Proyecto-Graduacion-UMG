-- 008: Libro, folio y numero de acuerdo de las vacaciones aprobadas.
-- RRHH lleva un control anual en Excel ("VACACIONES 2026") con el acta
-- municipal que autoriza cada vacacion: libro, folio y acuerdo correlativo
-- (01-2026, 02-2026, ...). Se guardan en la solicitud aprobada para que el
-- sistema pueda generar ese mismo control sin llenarlo a mano.
--
-- Se ejecuta con:
--   psql -U postgres -d municipalidad_rrhh -f database/migrations/008_acuerdo_vacaciones.sql

BEGIN;

ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS libro          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS folio          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS numero_acuerdo VARCHAR(20);

COMMENT ON COLUMN solicitudes.libro          IS 'Libro de actas donde consta el acuerdo (solo vacaciones aprobadas).';
COMMENT ON COLUMN solicitudes.folio          IS 'Folio del libro de actas.';
COMMENT ON COLUMN solicitudes.numero_acuerdo IS 'Correlativo del acuerdo por anio, p. ej. 01-2026. Lo asigna el sistema al aprobar si RRHH no lo escribe.';

-- Un mismo acuerdo no puede amparar dos solicitudes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitudes_numero_acuerdo
  ON solicitudes (numero_acuerdo) WHERE numero_acuerdo IS NOT NULL;

-- La vista agrega las tres columnas al final (CREATE OR REPLACE exige
-- conservar las existentes en su orden).
CREATE OR REPLACE VIEW v_solicitudes AS
 SELECT s.id,
    s.estado,
    s.fecha_inicio,
    s.fecha_fin,
    s.dias_solicitados,
    s.motivo,
    s.comentario_rrhh,
    s.creado_en,
    s.fecha_revision,
    e.codigo_empleado,
    (((e.nombres)::text || ' '::text) || (e.apellidos)::text) AS empleado,
    d.nombre AS departamento,
    p.nombre AS puesto,
    t.nombre AS tipo_solicitud,
    (((eu.nombres)::text || ' '::text) || (eu.apellidos)::text) AS revisado_por,
    s.libro,
    s.folio,
    s.numero_acuerdo
   FROM solicitudes s
     JOIN empleados e ON s.id_empleado = e.id
     JOIN departamentos d ON e.id_departamento = d.id
     JOIN puestos p ON e.id_puesto = p.id
     JOIN tipos_solicitud t ON s.id_tipo = t.id
     LEFT JOIN usuarios u ON s.id_revisado_por = u.id
     LEFT JOIN empleados eu ON u.id_empleado = eu.id;

COMMIT;
