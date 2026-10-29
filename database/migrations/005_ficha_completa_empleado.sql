-- Migracion 005 - Ficha completa del empleado (formato de RRHH)
-- Municipalidad de Jalapa
--
-- La Direccion de Recursos Humanos lleva el registro del personal en una hoja
-- de Excel con unas 60 columnas. El sistema solo cubria una parte (nombres,
-- DPI, fechas, departamento, puesto, salario base), asi que RRHH seguia
-- dependiendo del archivo. Esta migracion agrega a `empleados` el resto de las
-- columnas de esa hoja para que la ficha del sistema la reemplace.
--
-- Lo que YA existia y no se duplica:
--   FECHA DE INGRESO         -> fecha_ingreso     SEXO              -> genero
--   APELLIDOS / NOMBRES      -> apellidos, nombres
--   DPI                      -> dpi               TELEFONO          -> telefono
--   FECHA DE NACIMIENTO      -> fecha_nacimiento  CORREO ELECTRONICO -> correo
--   PUESTO NOMINAL           -> id_puesto         SUELDO BASE       -> salario_base
--   DIRECCION RESIDENCIAL    -> direccion
--   DEPENDENCIA DONDE LABORA -> id_departamento
--
-- Tres decisiones que conviene conocer:
--
--   1. ACTIVO / PASIVO / FALLECIDO son tres columnas en el Excel, pero se
--      excluyen entre si: nadie es activo y fallecido a la vez. Aqui es una
--      sola columna `situacion` con esos tres valores, para que no queden
--      fichas con dos casillas marcadas.
--
--   2. SIN FALTAS / FALTA LEVE / FALTA GRAVE, por lo mismo, es una sola
--      columna `analisis_expediente`.
--
--   3. RTU, boleto de ornato, constancia de la CGC y antecedentes guardan
--      UNICAMENTE la fecha de vencimiento: esa fecha ya dice de que anio es el
--      documento y si sigue vigente, asi que no hace falta una columna por
--      anio (el Excel trae "CGC 2025" y "CGC 2026" por separado; aqui es
--      `cgc_vence`, que se actualiza al renovar la constancia).
--
-- Las fechas de reinstalacion y el sueldo mes a mes quedan como columnas
-- fijas, tal como estan en el Excel, por indicacion de RRHH.
--
-- Todo es opcional (NULL): las fichas que ya existen siguen siendo validas y
-- RRHH completa los datos a su ritmo.
--
-- Es idempotente: se puede reejecutar sin efecto adicional.
--
--   psql -U postgres -d municipalidad_rrhh -f database/migrations/005_ficha_completa_empleado.sql

BEGIN;

-- 1. Ubicacion dentro de la Municipalidad ------------------------------------
-- `direccion_municipal` es la Direccion (Recursos Humanos, Servicios Publicos
-- y Transporte, Ordenamiento Territorial...), el nivel de arriba de la
-- dependencia; no confundir con `direccion`, que es el domicilio del empleado.

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS direccion_municipal VARCHAR(150),
  ADD COLUMN IF NOT EXISTS puesto_funcional    VARCHAR(150),
  ADD COLUMN IF NOT EXISTS renglon             VARCHAR(10),
  ADD COLUMN IF NOT EXISTS ubicacion_fisica    VARCHAR(150),
  ADD COLUMN IF NOT EXISTS jornada             VARCHAR(120);

COMMENT ON COLUMN empleados.direccion_municipal IS
  'Direccion municipal a la que pertenece. No es el domicilio: eso es empleados.direccion.';
COMMENT ON COLUMN empleados.puesto_funcional IS
  'Puesto que desempena en la practica, cuando difiere del nominal (empleados.id_puesto).';
COMMENT ON COLUMN empleados.renglon IS
  'Renglon presupuestario: 011, 021, 022, 029, 031, 182...';
COMMENT ON COLUMN empleados.jornada IS
  'Horario o jornada laboral asignada.';

-- 2. Profesion ---------------------------------------------------------------

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS profesion             VARCHAR(150),
  ADD COLUMN IF NOT EXISTS profesion_observacion TEXT,
  ADD COLUMN IF NOT EXISTS colegiado             VARCHAR(30);

COMMENT ON COLUMN empleados.colegiado IS
  'Numero de colegiado activo, cuando la profesion lo requiere.';

-- 3. Datos personales --------------------------------------------------------

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nit          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS igss         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS situacion    VARCHAR(10) DEFAULT 'Activo';

-- Las restricciones van aparte porque ADD CONSTRAINT no admite IF NOT EXISTS:
-- se consulta el catalogo para que la migracion se pueda reejecutar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empleados_estado_civil_valido') THEN
    ALTER TABLE empleados ADD CONSTRAINT empleados_estado_civil_valido
      CHECK (estado_civil IS NULL
             OR estado_civil IN ('Soltero', 'Casado', 'Unido', 'Divorciado', 'Viudo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empleados_situacion_valida') THEN
    ALTER TABLE empleados ADD CONSTRAINT empleados_situacion_valida
      CHECK (situacion IS NULL OR situacion IN ('Activo', 'Pasivo', 'Fallecido'));
  END IF;
END $$;

COMMENT ON COLUMN empleados.situacion IS
  'Clase del empleado: Activo, Pasivo (jubilado) o Fallecido. Distinto de `estado`, que dice si la ficha esta vigente en el sistema.';

-- 4. Fechas de reinstalacion -------------------------------------------------
-- Columnas fijas, una por anio con reinstalaciones, igual que en el Excel.

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS reinstalacion_2012 DATE,
  ADD COLUMN IF NOT EXISTS reinstalacion_2016 DATE,
  ADD COLUMN IF NOT EXISTS reinstalacion_2017 DATE,
  ADD COLUMN IF NOT EXISTS reinstalacion_2018 DATE,
  ADD COLUMN IF NOT EXISTS reinstalacion_2019 DATE,
  ADD COLUMN IF NOT EXISTS reinstalacion_2022 DATE,
  ADD COLUMN IF NOT EXISTS reinstalacion_2024 DATE;

-- 5. Sueldo ------------------------------------------------------------------
-- `sueldos_anio` dice a que anio corresponden los doce meses de abajo, para que
-- la ficha no siga diciendo "2026" cuando ya se captura otro anio.

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS bonificacion_37_2001 NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS sueldos_anio         INTEGER,
  ADD COLUMN IF NOT EXISTS sueldo_enero         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_febrero       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_marzo         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_abril         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_mayo          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_junio         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_julio         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_agosto        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_septiembre    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_octubre       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_noviembre     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sueldo_diciembre     NUMERIC(10,2);

COMMENT ON COLUMN empleados.bonificacion_37_2001 IS
  'Bonificacion incentivo del Decreto Ley 37-2001.';
COMMENT ON COLUMN empleados.sueldos_anio IS
  'Anio al que corresponden las columnas sueldo_enero .. sueldo_diciembre.';

-- 6. Expediente y documentos -------------------------------------------------
-- De RTU, ornato, CGC y antecedentes se guarda solo el vencimiento: con esa
-- fecha se sabe si el documento esta vigente y de que anio es.

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS analisis_expediente           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS observacion_expediente        TEXT,
  ADD COLUMN IF NOT EXISTS rtu_vence                     DATE,
  ADD COLUMN IF NOT EXISTS boleto_ornato_vence           DATE,
  ADD COLUMN IF NOT EXISTS cgc_vence                     DATE,
  ADD COLUMN IF NOT EXISTS antecedentes_penales_vence    DATE,
  ADD COLUMN IF NOT EXISTS antecedentes_policiacos_vence DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empleados_analisis_expediente_valido') THEN
    ALTER TABLE empleados ADD CONSTRAINT empleados_analisis_expediente_valido
      CHECK (analisis_expediente IS NULL
             OR analisis_expediente IN ('Sin faltas', 'Falta leve', 'Falta grave'));
  END IF;
END $$;

COMMENT ON COLUMN empleados.cgc_vence IS
  'Vencimiento de la constancia transitoria de inexistencia de reclamacion de cargos (Contraloria General de Cuentas).';

-- 7. Las fichas que ya existen quedan como Activo -----------------------------
-- El DEFAULT solo aplica a filas nuevas; estas ya estaban.

UPDATE empleados SET situacion = 'Activo' WHERE situacion IS NULL;

COMMIT;
