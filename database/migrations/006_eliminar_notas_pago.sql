-- 006: Elimina el módulo de notas de pago / nómina.
-- La funcionalidad se retiró del sistema; la tabla ya no se usa en el backend.
-- Los registros de auditoría previos con tabla 'notas_pago' se conservan como historial.

DROP TABLE IF EXISTS public.notas_pago CASCADE;
DROP SEQUENCE IF EXISTS public.notas_pago_id_seq;
