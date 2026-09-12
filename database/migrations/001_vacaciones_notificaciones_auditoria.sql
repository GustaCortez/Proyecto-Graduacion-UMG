-- =============================================================================
-- Migracion 001
-- Sistema de Gestion de RRHH - Municipalidad de Jalapa
--
-- Habilita: vacaciones conforme a la Ley de Servicio Municipal (Decreto 1-87,
-- art. 44 b), solicitud de vacaciones con descuento automatico, historial,
-- notificaciones, documentos adjuntos, auditoria, refresh tokens y foto de perfil.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Asuetos / dias feriados
--    El art. 44 b) mide las vacaciones en DIAS HABILES, asi que hace falta saber
--    que dias no se cuentan. Editable por RRHH para agregar la feria titular.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dias_feriados (
  id         SERIAL PRIMARY KEY,
  fecha      DATE         NOT NULL UNIQUE,
  nombre     VARCHAR(150) NOT NULL,
  tipo       VARCHAR(20)  NOT NULL DEFAULT 'Nacional'
             CHECK (tipo IN ('Nacional', 'Municipal')),
  activo     BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feriados_fecha ON dias_feriados (fecha) WHERE activo;

-- -----------------------------------------------------------------------------
-- 2. Vacaciones: fecha en que se adquiere el derecho (el aniversario de ingreso)
-- -----------------------------------------------------------------------------
ALTER TABLE vacaciones ADD COLUMN IF NOT EXISTS derecho_desde DATE;

COMMENT ON COLUMN vacaciones.derecho_desde IS
  'Aniversario de ingreso en que se adquiere el derecho del ano. NULL = aun no lo adquiere.';
COMMENT ON COLUMN vacaciones.dias_asignados IS
  'Dias habiles segun Ley de Servicio Municipal art. 44 b): 20 tras 1 ano, 25 tras 5 anos.';

-- -----------------------------------------------------------------------------
-- 3. Solicitudes: trazabilidad del descuento automatico de vacaciones
-- -----------------------------------------------------------------------------
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS dias_habiles     INTEGER;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS dias_descontados INTEGER NOT NULL DEFAULT 0;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS id_vacaciones    INTEGER
  REFERENCES vacaciones(id) ON DELETE SET NULL;

COMMENT ON COLUMN solicitudes.dias_habiles IS
  'Dias habiles reales del rango (excluye fines de semana y asuetos).';
COMMENT ON COLUMN solicitudes.dias_descontados IS
  'Dias efectivamente descontados del saldo. Permite revertir si se cancela.';

CREATE INDEX IF NOT EXISTS idx_solicitudes_empleado ON solicitudes (id_empleado, creado_en DESC);

-- -----------------------------------------------------------------------------
-- 4. Empleados: foto de perfil
-- -----------------------------------------------------------------------------
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS foto_url VARCHAR(500);

-- -----------------------------------------------------------------------------
-- 5. Refresh tokens (renovacion automatica de sesion, con rotacion)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              SERIAL PRIMARY KEY,
  id_usuario      INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash      CHAR(64)     NOT NULL UNIQUE,
  expira_en       TIMESTAMPTZ  NOT NULL,
  revocado_en     TIMESTAMPTZ,
  reemplazado_por INTEGER      REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  user_agent      VARCHAR(300),
  ip              VARCHAR(45),
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_usuario ON refresh_tokens (id_usuario, expira_en DESC);

COMMENT ON COLUMN refresh_tokens.token_hash IS
  'SHA-256 del refresh token. El valor en claro nunca se guarda.';

-- -----------------------------------------------------------------------------
-- 6. Indices para notificaciones y auditoria (las tablas ya existian sin uso)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario
  ON notificaciones (id_usuario, leida, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_creado  ON auditoria (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria (id_usuario, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabla   ON auditoria (tabla, registro_id);

CREATE INDEX IF NOT EXISTS idx_documentos_solicitud
  ON documentos_adjuntos (id_solicitud);

COMMIT;
