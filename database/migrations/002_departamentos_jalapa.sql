-- Migracion 002 - Departamentos reales de la Municipalidad de Jalapa
-- Listado proporcionado por la Gerencia de Recursos Humanos.
-- Idempotente: se puede reejecutar sin duplicar (departamentos.nombre no es UNIQUE).
-- "Obras Municipales" ya existe desde la carga inicial y no se vuelve a insertar.

BEGIN;

INSERT INTO departamentos (nombre, descripcion, activo)
SELECT d.nombre, d.descripcion, TRUE
  FROM (VALUES
    ('Atención al Vecino',            'Atención, información y gestión de trámites del vecino'),
    ('Servicio de Nomenclatura',      'Asignación y registro de nomenclatura de calles e inmuebles'),
    ('IUSI',                          'Impuesto Único Sobre Inmuebles'),
    ('Ordenamiento Territorial',      'Planificación y ordenamiento del territorio municipal'),
    ('Licencias de Construcción',     'Autorización y control de licencias de construcción'),
    ('Servicios Públicos Básicos',    'Agua, luz, comercio, restricciones de comercios, mercado, transporte, cementerio y arbitrios'),
    ('Parques y Jardinización',       'Parques, calzadas, avenidas y jardinización'),
    ('Caminos Vecinales',             'Mantenimiento de caminos vecinales'),
    ('Apoyo a la Educación',          'Apoyo a la educación y remozamiento de escuelas'),
    ('Programas Sociales',            'Apoyo a la mujer, entrega de fertilizantes y bolsas a emprendedores')
  ) AS d(nombre, descripcion)
 WHERE NOT EXISTS (
   SELECT 1 FROM departamentos x WHERE LOWER(x.nombre) = LOWER(d.nombre)
 );

COMMIT;
