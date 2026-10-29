--
-- Datos iniciales (catalogos)
-- Sistema de Gestion de Recursos Humanos - Municipalidad de Jalapa
--
-- Se ejecuta DESPUES de schema.sql. Es idempotente: se puede repetir sin
-- duplicar filas. No incluye empleados ni usuarios; el administrador se crea
-- aparte con  node backend/scripts/crear-admin.js  para no dejar ninguna
-- contrasena escrita en el repositorio.
--
--   psql -U postgres -d municipalidad_rrhh -f database/seed.sql
--

BEGIN;

--
-- Departamentos
-- Unidades administrativas de la Municipalidad.
--

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (1, 'Alcaldía', 'Despacho del Alcalde Municipal', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (2, 'Recursos Humanos', 'Gestión del personal municipal', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (3, 'Tesorería', 'Administración financiera y presupuestaria', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (4, 'Servicios Públicos', 'Agua, limpieza y mantenimiento urbano', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (5, 'Registro Civil', 'Registro de nacimientos, matrimonios y defunciones', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (6, 'Obras Municipales', 'Planificación y ejecución de obras de infraestructura', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (7, 'Parques y Jardinización', 'Parques, calzadas, avenidas y jardinización', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (8, 'Servicios Públicos Básicos', 'Agua, luz, comercio, restricciones de comercios, mercado, transporte, cementerio y arbitrios', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (9, 'Servicio de Nomenclatura', 'Asignación y registro de nomenclatura de calles e inmuebles', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (10, 'Apoyo a la Educación', 'Apoyo a la educación y remozamiento de escuelas', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (11, 'IUSI', 'Impuesto Único Sobre Inmuebles', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (12, 'Programas Sociales', 'Apoyo a la mujer, entrega de fertilizantes y bolsas a emprendedores', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (13, 'Atención al Vecino', 'Atención, información y gestión de trámites del vecino', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (14, 'Ordenamiento Territorial', 'Planificación y ordenamiento del territorio municipal', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (15, 'Caminos Vecinales', 'Mantenimiento de caminos vecinales', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departamentos (id, nombre, descripcion, activo, creado_en) VALUES (16, 'Licencias de Construcción', 'Autorización y control de licencias de construcción', true, '2026-09-12 12:19:32.448715-06')
ON CONFLICT (id) DO NOTHING;

--
-- Puestos
-- Catalogo de puestos del personal.
--

INSERT INTO puestos (id, nombre, nivel_salarial, descripcion, activo, creado_en) VALUES (1, 'Alcalde Municipal', 'Nivel 1', 'Máxima autoridad del municipio', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO puestos (id, nombre, nivel_salarial, descripcion, activo, creado_en) VALUES (2, 'Director de RRHH', 'Nivel 2', 'Responsable de la gestión del talento humano', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO puestos (id, nombre, nivel_salarial, descripcion, activo, creado_en) VALUES (3, 'Contador', 'Nivel 3', 'Gestión contable y financiera', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO puestos (id, nombre, nivel_salarial, descripcion, activo, creado_en) VALUES (4, 'Oficial de Registro', 'Nivel 4', 'Atención al ciudadano y registro de documentos', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO puestos (id, nombre, nivel_salarial, descripcion, activo, creado_en) VALUES (5, 'Inspector de Obras', 'Nivel 3', 'Supervisión y control de proyectos de construcción', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

INSERT INTO puestos (id, nombre, nivel_salarial, descripcion, activo, creado_en) VALUES (6, 'Auxiliar Administrativo', 'Nivel 5', 'Apoyo en tareas administrativas generales', true, '2026-05-20 12:08:35.255581-06')
ON CONFLICT (id) DO NOTHING;

--
-- Tipos de solicitud
-- Los tipos 5, 7 y 8 solo los registra RRHH (ver TIPOS_SOLO_RRHH).
--

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (6, 'Constancia laboral', 'Solicitud de constancia de trabajo', false, true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (10, 'Constancia de ingresos', NULL, false, true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (7, 'Alta de empleado', 'Registro de ingreso de nuevo empleado', true, false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (8, 'Baja de empleado', 'Registro de salida definitiva de empleado', true, false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (9, 'Carnet IRTRA', NULL, false, false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (1, 'Vacaciones', 'Solicitud de días de descanso anuales', false, true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (2, 'Permiso con goce', 'Permiso con pago de salario completo', true, false, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (3, 'Permiso sin goce', 'Permiso sin pago de salario', true, false, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (5, 'Suspension disciplinaria', 'Suspensión por falta disciplinaria', true, false, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tipos_solicitud (id, nombre, descripcion, requiere_doc, activo, es_ausencia) VALUES (4, 'Permiso médico', 'Ausencia por razones de salud', true, true, true)
ON CONFLICT (id) DO NOTHING;

--
-- Las secuencias deben quedar por encima del ultimo id insertado; de lo
-- contrario el primer registro nuevo chocaria con una clave ya usada.
--

SELECT setval('departamentos_id_seq',   COALESCE((SELECT MAX(id) FROM departamentos),   1));
SELECT setval('puestos_id_seq',         COALESCE((SELECT MAX(id) FROM puestos),         1));
SELECT setval('tipos_solicitud_id_seq', COALESCE((SELECT MAX(id) FROM tipos_solicitud), 1));

COMMIT;
