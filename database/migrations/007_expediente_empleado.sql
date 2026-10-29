-- 007: Expediente del empleado.
-- Historial por persona que la Dirección de RRHH pidió llevar en el sistema:
-- capacitaciones, evaluaciones de desempeño, llamadas de atención y el aviso
-- de baja ante el IGSS cuando el empleado deja la Municipalidad.
--
-- Se ejecuta con:
--   psql -U postgres -d municipalidad_rrhh -f database/migrations/007_expediente_empleado.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Capacitaciones recibidas (cursos, talleres, diplomados...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capacitaciones (
  id             SERIAL PRIMARY KEY,
  id_empleado    INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  nombre         VARCHAR(200) NOT NULL,
  institucion    VARCHAR(150),
  tipo           VARCHAR(20)  NOT NULL DEFAULT 'Curso'
                 CHECK (tipo IN ('Curso','Taller','Diplomado','Seminario','Certificación','Otro')),
  modalidad      VARCHAR(12)  NOT NULL DEFAULT 'Presencial'
                 CHECK (modalidad IN ('Presencial','Virtual','Mixta')),
  fecha_inicio   DATE NOT NULL,
  fecha_fin      DATE,
  horas          NUMERIC(6,1) CHECK (horas IS NULL OR horas >= 0),
  aprobada       BOOLEAN NOT NULL DEFAULT TRUE,
  observaciones  TEXT,
  registrado_por INTEGER REFERENCES usuarios(id),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);
CREATE INDEX IF NOT EXISTS idx_capacitaciones_empleado ON capacitaciones (id_empleado, fecha_inicio DESC);

COMMENT ON TABLE capacitaciones IS
  'Formación recibida por el empleado. Las horas alimentan el reporte por departamento.';

-- ---------------------------------------------------------------------------
-- Evaluaciones de desempeño
-- Cinco criterios fijos con puntaje de 1 a 5; el promedio lo calcula la base
-- para que no dependa de quién lo inserte.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluaciones_desempeno (
  id              SERIAL PRIMARY KEY,
  id_empleado     INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  periodo         VARCHAR(40) NOT NULL,          -- p. ej. "2026 - Primer semestre"
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  evaluador       VARCHAR(150) NOT NULL,         -- jefe inmediato que evalúa
  puntualidad     SMALLINT NOT NULL CHECK (puntualidad     BETWEEN 1 AND 5),
  responsabilidad SMALLINT NOT NULL CHECK (responsabilidad BETWEEN 1 AND 5),
  calidad_trabajo SMALLINT NOT NULL CHECK (calidad_trabajo BETWEEN 1 AND 5),
  trabajo_equipo  SMALLINT NOT NULL CHECK (trabajo_equipo  BETWEEN 1 AND 5),
  iniciativa      SMALLINT NOT NULL CHECK (iniciativa      BETWEEN 1 AND 5),
  promedio        NUMERIC(3,2) GENERATED ALWAYS AS (
                    ROUND((puntualidad + responsabilidad + calidad_trabajo
                           + trabajo_equipo + iniciativa) / 5.0, 2)) STORED,
  fortalezas      TEXT,
  areas_mejora    TEXT,
  compromisos     TEXT,
  registrado_por  INTEGER REFERENCES usuarios(id),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_empleado ON evaluaciones_desempeno (id_empleado, fecha DESC);

COMMENT ON COLUMN evaluaciones_desempeno.promedio IS
  'Promedio de los cinco criterios. 4.50+ Excelente, 3.50+ Muy bueno, 2.50+ Satisfactorio, menos: Necesita mejorar.';

-- ---------------------------------------------------------------------------
-- Llamadas de atención (amonestaciones)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS llamadas_atencion (
  id             SERIAL PRIMARY KEY,
  id_empleado    INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo           VARCHAR(10) NOT NULL DEFAULT 'Verbal'
                 CHECK (tipo IN ('Verbal','Escrita','Grave')),
  motivo         TEXT NOT NULL,
  sancion        TEXT,                           -- medida aplicada, si hubo
  emitida_por    VARCHAR(150),                   -- jefe o autoridad que la emite
  registrado_por INTEGER REFERENCES usuarios(id),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_llamadas_empleado ON llamadas_atencion (id_empleado, fecha DESC);

-- ---------------------------------------------------------------------------
-- Aviso de baja ante el IGSS
-- Se crea automáticamente en estado Pendiente cuando RRHH da de baja a un
-- empleado; RRHH lo marca Presentado cuando entrega el formulario al IGSS.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bajas_igss (
  id                SERIAL PRIMARY KEY,
  id_empleado       INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  fecha_baja        DATE NOT NULL,                -- último día laborado
  motivo            VARCHAR(20) NOT NULL DEFAULT 'Otro'
                    CHECK (motivo IN ('Renuncia','Despido','Fin de contrato','Jubilación','Fallecimiento','Otro')),
  numero_afiliacion VARCHAR(20),                  -- copia del número IGSS del empleado
  estado            VARCHAR(12) NOT NULL DEFAULT 'Pendiente'
                    CHECK (estado IN ('Pendiente','Presentado')),
  fecha_aviso       DATE,                         -- cuándo se presentó al IGSS
  numero_aviso      VARCHAR(40),                  -- correlativo del formulario
  observaciones     TEXT,
  registrado_por    INTEGER REFERENCES usuarios(id),
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (estado = 'Pendiente' OR fecha_aviso IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_bajas_igss_empleado ON bajas_igss (id_empleado, fecha_baja DESC);
CREATE INDEX IF NOT EXISTS idx_bajas_igss_pendientes ON bajas_igss (estado) WHERE estado = 'Pendiente';

-- ---------------------------------------------------------------------------
-- Adjuntos del expediente (diplomas, actas firmadas, formulario IGSS...).
-- Tabla propia: documentos_adjuntos está amarrada a una solicitud.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expediente_adjuntos (
  id             SERIAL PRIMARY KEY,
  id_empleado    INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  seccion        VARCHAR(30) NOT NULL
                 CHECK (seccion IN ('capacitaciones','evaluaciones','llamadas','bajas-igss')),
  id_registro    INTEGER NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  ruta_archivo   VARCHAR(500) NOT NULL,
  tipo_mime      VARCHAR(100),
  tamano_bytes   INTEGER,
  subido_por     INTEGER REFERENCES usuarios(id),
  subido_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expediente_adjuntos ON expediente_adjuntos (seccion, id_registro);

COMMIT;
