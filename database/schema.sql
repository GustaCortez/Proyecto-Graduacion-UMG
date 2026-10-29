--
-- Esquema base de la base de datos
-- Sistema de Gestion de Recursos Humanos - Municipalidad de Jalapa
--
-- Genera la estructura completa: tablas, vistas, indices y restricciones.
-- Es el PRIMER paso de la instalacion; despues van seed.sql y las migraciones.
--
--   createdb -U postgres municipalidad_rrhh
--   psql -U postgres -d municipalidad_rrhh -f database/schema.sql
--   psql -U postgres -d municipalidad_rrhh -f database/seed.sql
--   cd backend && node scripts/migrar.js
--   cd backend && node scripts/crear-admin.js
--
-- Exportado de PostgreSQL 18 con pg_dump --schema-only.
--



-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: contrato_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contrato_tipo AS ENUM (
    'Permanente',
    'Temporal',
    'Contrato'
);


--
-- Name: estado_emp_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_emp_tipo AS ENUM (
    'Activo',
    'Inactivo',
    'Suspendido'
);


--
-- Name: estado_sol_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_sol_tipo AS ENUM (
    'Pendiente',
    'En revision',
    'Aprobada',
    'Rechazada',
    'Cancelada'
);


--
-- Name: genero_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.genero_tipo AS ENUM (
    'M',
    'F',
    'Otro'
);


--
-- Name: rol_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rol_tipo AS ENUM (
    'admin',
    'rrhh',
    'empleado'
);


--
-- Name: tipo_permiso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_permiso AS ENUM (
    'Permiso con goce',
    'Permiso sin goce',
    'Permiso medico',
    'Suspension'
);


--
-- Name: fn_actualizar_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_actualizar_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.actualizado_en = NOW(); RETURN NEW; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria (
    id bigint NOT NULL,
    id_usuario integer,
    accion character varying(100) NOT NULL,
    tabla character varying(100),
    registro_id integer,
    detalle jsonb,
    ip character varying(45),
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_id_seq OWNED BY public.auditoria.id;


--
-- Name: departamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departamentos (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion character varying(255),
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: departamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departamentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departamentos_id_seq OWNED BY public.departamentos.id;


--
-- Name: dias_feriados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dias_feriados (
    id integer NOT NULL,
    fecha date NOT NULL,
    nombre character varying(150) NOT NULL,
    tipo character varying(20) DEFAULT 'Nacional'::character varying NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dias_feriados_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['Nacional'::character varying, 'Municipal'::character varying])::text[])))
);


--
-- Name: dias_feriados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dias_feriados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dias_feriados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dias_feriados_id_seq OWNED BY public.dias_feriados.id;


--
-- Name: documentos_adjuntos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_adjuntos (
    id integer NOT NULL,
    id_solicitud integer NOT NULL,
    nombre_archivo character varying(255) NOT NULL,
    ruta_archivo character varying(500) NOT NULL,
    tipo_mime character varying(100),
    tamano_bytes integer,
    subido_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documentos_adjuntos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documentos_adjuntos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documentos_adjuntos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documentos_adjuntos_id_seq OWNED BY public.documentos_adjuntos.id;


--
-- Name: empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empleados (
    id integer NOT NULL,
    codigo_empleado character varying(20) NOT NULL,
    nombres character varying(100) NOT NULL,
    apellidos character varying(100) NOT NULL,
    dpi character varying(15) NOT NULL,
    fecha_nacimiento date NOT NULL,
    genero public.genero_tipo NOT NULL,
    telefono character varying(15),
    correo character varying(150),
    direccion text,
    fecha_ingreso date NOT NULL,
    fecha_baja date,
    motivo_baja text,
    tipo_contrato public.contrato_tipo DEFAULT 'Permanente'::public.contrato_tipo NOT NULL,
    salario_base numeric(10,2) DEFAULT 0.00 NOT NULL,
    dias_vacaciones integer DEFAULT 15 NOT NULL,
    id_departamento integer NOT NULL,
    id_puesto integer NOT NULL,
    estado public.estado_emp_tipo DEFAULT 'Activo'::public.estado_emp_tipo NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    foto_url character varying(500),
    direccion_municipal character varying(150),
    puesto_funcional character varying(150),
    renglon character varying(10),
    ubicacion_fisica character varying(150),
    jornada character varying(120),
    profesion character varying(150),
    profesion_observacion text,
    colegiado character varying(30),
    estado_civil character varying(20),
    nit character varying(20),
    igss character varying(20),
    situacion character varying(10) DEFAULT 'Activo'::character varying,
    reinstalacion_2012 date,
    reinstalacion_2016 date,
    reinstalacion_2017 date,
    reinstalacion_2018 date,
    reinstalacion_2019 date,
    reinstalacion_2022 date,
    reinstalacion_2024 date,
    bonificacion_37_2001 numeric(10,2) DEFAULT 0.00,
    sueldos_anio integer,
    sueldo_enero numeric(10,2),
    sueldo_febrero numeric(10,2),
    sueldo_marzo numeric(10,2),
    sueldo_abril numeric(10,2),
    sueldo_mayo numeric(10,2),
    sueldo_junio numeric(10,2),
    sueldo_julio numeric(10,2),
    sueldo_agosto numeric(10,2),
    sueldo_septiembre numeric(10,2),
    sueldo_octubre numeric(10,2),
    sueldo_noviembre numeric(10,2),
    sueldo_diciembre numeric(10,2),
    analisis_expediente character varying(20),
    observacion_expediente text,
    rtu_vence date,
    boleto_ornato_vence date,
    cgc_vence date,
    antecedentes_penales_vence date,
    antecedentes_policiacos_vence date,
    CONSTRAINT empleados_analisis_expediente_valido CHECK (((analisis_expediente IS NULL) OR ((analisis_expediente)::text = ANY ((ARRAY['Sin faltas'::character varying, 'Falta leve'::character varying, 'Falta grave'::character varying])::text[])))),
    CONSTRAINT empleados_estado_civil_valido CHECK (((estado_civil IS NULL) OR ((estado_civil)::text = ANY ((ARRAY['Soltero'::character varying, 'Casado'::character varying, 'Unido'::character varying, 'Divorciado'::character varying, 'Viudo'::character varying])::text[])))),
    CONSTRAINT empleados_situacion_valida CHECK (((situacion IS NULL) OR ((situacion)::text = ANY ((ARRAY['Activo'::character varying, 'Pasivo'::character varying, 'Fallecido'::character varying])::text[]))))
);


--
-- Name: empleados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empleados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empleados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empleados_id_seq OWNED BY public.empleados.id;


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones (
    id integer NOT NULL,
    id_usuario integer NOT NULL,
    titulo character varying(200) NOT NULL,
    mensaje text NOT NULL,
    leida boolean DEFAULT false NOT NULL,
    id_solicitud integer,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notificaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificaciones_id_seq OWNED BY public.notificaciones.id;


--
-- Name: permisos_suspensiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permisos_suspensiones (
    id integer NOT NULL,
    id_solicitud integer NOT NULL,
    id_empleado integer NOT NULL,
    tipo public.tipo_permiso NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    dias integer NOT NULL,
    observaciones text,
    registrado_por integer,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permisos_suspensiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permisos_suspensiones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permisos_suspensiones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permisos_suspensiones_id_seq OWNED BY public.permisos_suspensiones.id;


--
-- Name: puestos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.puestos (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    nivel_salarial character varying(50),
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: puestos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.puestos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: puestos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.puestos_id_seq OWNED BY public.puestos.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    id_usuario integer NOT NULL,
    token_hash character(64) NOT NULL,
    expira_en timestamp with time zone NOT NULL,
    revocado_en timestamp with time zone,
    reemplazado_por integer,
    user_agent character varying(300),
    ip character varying(45),
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN refresh_tokens.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.token_hash IS 'SHA-256 del refresh token. El valor en claro nunca se guarda.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: solicitudes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes (
    id integer NOT NULL,
    id_empleado integer NOT NULL,
    id_tipo integer NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date,
    dias_solicitados integer,
    motivo text NOT NULL,
    estado public.estado_sol_tipo DEFAULT 'Pendiente'::public.estado_sol_tipo NOT NULL,
    comentario_rrhh text,
    id_revisado_por integer,
    fecha_revision timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    dias_habiles integer,
    dias_descontados integer DEFAULT 0 NOT NULL,
    id_vacaciones integer
);


--
-- Name: COLUMN solicitudes.dias_habiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.solicitudes.dias_habiles IS 'Dias habiles reales del rango (excluye fines de semana y asuetos).';


--
-- Name: COLUMN solicitudes.dias_descontados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.solicitudes.dias_descontados IS 'Dias efectivamente descontados del saldo. Permite revertir si se cancela.';


--
-- Name: solicitudes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitudes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitudes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitudes_id_seq OWNED BY public.solicitudes.id;


--
-- Name: tipos_solicitud; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_solicitud (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    requiere_doc boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    es_ausencia boolean DEFAULT true NOT NULL
);


--
-- Name: COLUMN tipos_solicitud.es_ausencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tipos_solicitud.es_ausencia IS 'TRUE: el empleado se ausenta, se pide rango de fechas y se cuentan dias habiles. FALSE: tramite de documento o registro administrativo, una sola fecha y cero dias.';


--
-- Name: tipos_solicitud_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_solicitud_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_solicitud_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_solicitud_id_seq OWNED BY public.tipos_solicitud.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    id_empleado integer,
    username character varying(80) NOT NULL,
    password_hash character varying(255) NOT NULL,
    rol public.rol_tipo DEFAULT 'empleado'::public.rol_tipo NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    ultimo_acceso timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: v_dashboard_solicitudes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_dashboard_solicitudes AS
 SELECT estado,
    count(*) AS total,
    (min(creado_en))::date AS mas_antigua,
    (max(creado_en))::date AS mas_reciente
   FROM public.solicitudes
  GROUP BY estado;


--
-- Name: v_empleados_activos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_empleados_activos AS
 SELECT e.id,
    e.codigo_empleado,
    (((e.nombres)::text || ' '::text) || (e.apellidos)::text) AS nombre_completo,
    e.dpi,
    e.correo,
    e.telefono,
    e.tipo_contrato,
    e.salario_base,
    e.fecha_ingreso,
    e.estado,
    d.nombre AS departamento,
    p.nombre AS puesto
   FROM ((public.empleados e
     JOIN public.departamentos d ON ((e.id_departamento = d.id)))
     JOIN public.puestos p ON ((e.id_puesto = p.id)))
  WHERE (e.estado = 'Activo'::public.estado_emp_tipo)
  ORDER BY e.apellidos;


--
-- Name: v_solicitudes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_solicitudes AS
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
    (((eu.nombres)::text || ' '::text) || (eu.apellidos)::text) AS revisado_por
   FROM ((((((public.solicitudes s
     JOIN public.empleados e ON ((s.id_empleado = e.id)))
     JOIN public.departamentos d ON ((e.id_departamento = d.id)))
     JOIN public.puestos p ON ((e.id_puesto = p.id)))
     JOIN public.tipos_solicitud t ON ((s.id_tipo = t.id)))
     LEFT JOIN public.usuarios u ON ((s.id_revisado_por = u.id)))
     LEFT JOIN public.empleados eu ON ((u.id_empleado = eu.id)));


--
-- Name: vacaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacaciones (
    id integer NOT NULL,
    id_empleado integer NOT NULL,
    anio smallint NOT NULL,
    dias_asignados integer DEFAULT 15 NOT NULL,
    dias_tomados integer DEFAULT 0 NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    derecho_desde date,
    CONSTRAINT chk_dias CHECK ((dias_tomados <= dias_asignados))
);


--
-- Name: COLUMN vacaciones.dias_asignados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vacaciones.dias_asignados IS 'Dias habiles segun Ley de Servicio Municipal art. 44 b): 20 tras 1 ano, 25 tras 5 anos.';


--
-- Name: COLUMN vacaciones.derecho_desde; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vacaciones.derecho_desde IS 'Aniversario de ingreso en que se adquiere el derecho del ano. NULL = aun no lo adquiere.';


--
-- Name: vacaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vacaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vacaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vacaciones_id_seq OWNED BY public.vacaciones.id;


--
-- Name: auditoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria ALTER COLUMN id SET DEFAULT nextval('public.auditoria_id_seq'::regclass);


--
-- Name: departamentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos ALTER COLUMN id SET DEFAULT nextval('public.departamentos_id_seq'::regclass);


--
-- Name: dias_feriados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dias_feriados ALTER COLUMN id SET DEFAULT nextval('public.dias_feriados_id_seq'::regclass);


--
-- Name: documentos_adjuntos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_adjuntos ALTER COLUMN id SET DEFAULT nextval('public.documentos_adjuntos_id_seq'::regclass);


--
-- Name: empleados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados ALTER COLUMN id SET DEFAULT nextval('public.empleados_id_seq'::regclass);


--
-- Name: notificaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN id SET DEFAULT nextval('public.notificaciones_id_seq'::regclass);


--
-- Name: permisos_suspensiones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_suspensiones ALTER COLUMN id SET DEFAULT nextval('public.permisos_suspensiones_id_seq'::regclass);


--
-- Name: puestos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puestos ALTER COLUMN id SET DEFAULT nextval('public.puestos_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: solicitudes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes ALTER COLUMN id SET DEFAULT nextval('public.solicitudes_id_seq'::regclass);


--
-- Name: tipos_solicitud id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_solicitud ALTER COLUMN id SET DEFAULT nextval('public.tipos_solicitud_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: vacaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacaciones ALTER COLUMN id SET DEFAULT nextval('public.vacaciones_id_seq'::regclass);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);


--
-- Name: departamentos departamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departamentos_pkey PRIMARY KEY (id);


--
-- Name: dias_feriados dias_feriados_fecha_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dias_feriados
    ADD CONSTRAINT dias_feriados_fecha_key UNIQUE (fecha);


--
-- Name: dias_feriados dias_feriados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dias_feriados
    ADD CONSTRAINT dias_feriados_pkey PRIMARY KEY (id);


--
-- Name: documentos_adjuntos documentos_adjuntos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_adjuntos
    ADD CONSTRAINT documentos_adjuntos_pkey PRIMARY KEY (id);


--
-- Name: empleados empleados_codigo_empleado_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_codigo_empleado_key UNIQUE (codigo_empleado);


--
-- Name: empleados empleados_dpi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_dpi_key UNIQUE (dpi);


--
-- Name: empleados empleados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);


--
-- Name: permisos_suspensiones permisos_suspensiones_id_solicitud_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_suspensiones
    ADD CONSTRAINT permisos_suspensiones_id_solicitud_key UNIQUE (id_solicitud);


--
-- Name: permisos_suspensiones permisos_suspensiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_suspensiones
    ADD CONSTRAINT permisos_suspensiones_pkey PRIMARY KEY (id);


--
-- Name: puestos puestos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puestos
    ADD CONSTRAINT puestos_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: solicitudes solicitudes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes
    ADD CONSTRAINT solicitudes_pkey PRIMARY KEY (id);


--
-- Name: tipos_solicitud tipos_solicitud_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_solicitud
    ADD CONSTRAINT tipos_solicitud_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_id_empleado_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_id_empleado_key UNIQUE (id_empleado);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_username_key UNIQUE (username);


--
-- Name: vacaciones vacaciones_id_empleado_anio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacaciones
    ADD CONSTRAINT vacaciones_id_empleado_anio_key UNIQUE (id_empleado, anio);


--
-- Name: vacaciones vacaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacaciones
    ADD CONSTRAINT vacaciones_pkey PRIMARY KEY (id);


--
-- Name: empleados_correo_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX empleados_correo_unico ON public.empleados USING btree (lower(TRIM(BOTH FROM correo))) WHERE (correo IS NOT NULL);


--
-- Name: INDEX empleados_correo_unico; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.empleados_correo_unico IS 'El correo identifica a la persona: no puede repetirse entre expedientes.';


--
-- Name: idx_auditoria_creado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_creado ON public.auditoria USING btree (creado_en DESC);


--
-- Name: idx_auditoria_tabla; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_tabla ON public.auditoria USING btree (tabla, registro_id);


--
-- Name: idx_auditoria_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_usuario ON public.auditoria USING btree (id_usuario);


--
-- Name: idx_documentos_solicitud; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documentos_solicitud ON public.documentos_adjuntos USING btree (id_solicitud);


--
-- Name: idx_empleados_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empleados_codigo ON public.empleados USING btree (codigo_empleado);


--
-- Name: idx_empleados_departamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empleados_departamento ON public.empleados USING btree (id_departamento);


--
-- Name: idx_empleados_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empleados_estado ON public.empleados USING btree (estado);


--
-- Name: idx_feriados_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feriados_fecha ON public.dias_feriados USING btree (fecha) WHERE activo;


--
-- Name: idx_notif_usuario_leida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_usuario_leida ON public.notificaciones USING btree (id_usuario, leida);


--
-- Name: idx_notificaciones_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_usuario ON public.notificaciones USING btree (id_usuario, leida, creado_en DESC);


--
-- Name: idx_refresh_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_usuario ON public.refresh_tokens USING btree (id_usuario, expira_en DESC);


--
-- Name: idx_solicitudes_empleado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_solicitudes_empleado ON public.solicitudes USING btree (id_empleado);


--
-- Name: idx_solicitudes_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_solicitudes_estado ON public.solicitudes USING btree (estado);


--
-- Name: idx_solicitudes_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_solicitudes_tipo ON public.solicitudes USING btree (id_tipo);


--
-- Name: empleados trg_empleados_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_empleados_updated BEFORE UPDATE ON public.empleados FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_timestamp();


--
-- Name: solicitudes trg_solicitudes_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_solicitudes_updated BEFORE UPDATE ON public.solicitudes FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_timestamp();


--
-- Name: vacaciones trg_vacaciones_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vacaciones_updated BEFORE UPDATE ON public.vacaciones FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_timestamp();


--
-- Name: auditoria fk_aud_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT fk_aud_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: documentos_adjuntos fk_doc_solicitud; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_adjuntos
    ADD CONSTRAINT fk_doc_solicitud FOREIGN KEY (id_solicitud) REFERENCES public.solicitudes(id) ON DELETE CASCADE;


--
-- Name: empleados fk_emp_departamento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT fk_emp_departamento FOREIGN KEY (id_departamento) REFERENCES public.departamentos(id) ON UPDATE CASCADE;


--
-- Name: empleados fk_emp_puesto; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT fk_emp_puesto FOREIGN KEY (id_puesto) REFERENCES public.puestos(id) ON UPDATE CASCADE;


--
-- Name: notificaciones fk_not_solicitud; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT fk_not_solicitud FOREIGN KEY (id_solicitud) REFERENCES public.solicitudes(id) ON DELETE SET NULL;


--
-- Name: notificaciones fk_not_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT fk_not_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: permisos_suspensiones fk_ps_empleado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_suspensiones
    ADD CONSTRAINT fk_ps_empleado FOREIGN KEY (id_empleado) REFERENCES public.empleados(id) ON UPDATE CASCADE;


--
-- Name: permisos_suspensiones fk_ps_registrado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_suspensiones
    ADD CONSTRAINT fk_ps_registrado FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: permisos_suspensiones fk_ps_solicitud; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_suspensiones
    ADD CONSTRAINT fk_ps_solicitud FOREIGN KEY (id_solicitud) REFERENCES public.solicitudes(id) ON UPDATE CASCADE;


--
-- Name: solicitudes fk_sol_empleado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes
    ADD CONSTRAINT fk_sol_empleado FOREIGN KEY (id_empleado) REFERENCES public.empleados(id) ON UPDATE CASCADE;


--
-- Name: solicitudes fk_sol_revisado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes
    ADD CONSTRAINT fk_sol_revisado FOREIGN KEY (id_revisado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: solicitudes fk_sol_tipo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes
    ADD CONSTRAINT fk_sol_tipo FOREIGN KEY (id_tipo) REFERENCES public.tipos_solicitud(id) ON UPDATE CASCADE;


--
-- Name: usuarios fk_usr_empleado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT fk_usr_empleado FOREIGN KEY (id_empleado) REFERENCES public.empleados(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: vacaciones fk_vac_empleado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacaciones
    ADD CONSTRAINT fk_vac_empleado FOREIGN KEY (id_empleado) REFERENCES public.empleados(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_reemplazado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_reemplazado_por_fkey FOREIGN KEY (reemplazado_por) REFERENCES public.refresh_tokens(id) ON DELETE SET NULL;


--
-- Name: solicitudes solicitudes_id_vacaciones_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes
    ADD CONSTRAINT solicitudes_id_vacaciones_fkey FOREIGN KEY (id_vacaciones) REFERENCES public.vacaciones(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


