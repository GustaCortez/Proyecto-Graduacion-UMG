# Sistema de Gestión de Recursos Humanos
**Municipalidad de Jalapa, Guatemala**

Proyecto de Graduación — Ingeniería en Sistemas  
Universidad Mariano Gálvez de Guatemala

---

## Descripción

Sistema web para la gestión del personal de la Municipalidad de Jalapa. Permite administrar empleados, procesar solicitudes de permisos y vacaciones, y visualizar estadísticas en un panel de control centralizado.

## Tecnologías

| Capa       | Tecnología                        |
|------------|-----------------------------------|
| Frontend   | React 19, React Router, Axios     |
| Backend    | Node.js, Express 5, JWT           |
| Base de datos | PostgreSQL 18                  |
| Seguridad  | bcrypt, JWT + refresh token rotativo, Helmet, CORS |
| Archivos   | Multer (documentos y fotos)       |
| Tiempo real| Server-Sent Events (SSE)          |


## Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd municipalidad-rrhh
```

### 2. Configurar la base de datos

Desde pgAdmin o psql, crear la base de datos:

```sql
CREATE DATABASE municipalidad_rrhh;
```

Cargar estructura, catálogos, migraciones, asuetos, saldos de vacaciones y la
cuenta de administrador con un solo comando (es idempotente: puede repetirse):

```bash
cd backend
npm install
ADMIN_PASSWORD="SuClaveSegura2026" node scripts/instalar-bd.js
```

En PowerShell:

```powershell
$env:ADMIN_PASSWORD="SuClaveSegura2026"; node scripts/instalar-bd.js
```

Si prefiere hacerlo por pasos con psql: `schema.sql`, `seed.sql`,
`migrations/002`, `migrations/007`, `migrations/008`, luego `node scripts/migrar.js` y
`node scripts/crear-admin.js`. Las migraciones 001 y 003 a 006 ya vienen
incluidas en `schema.sql`.

### 3. Configurar el backend

```bash
cd backend
cp .env.example .env
```

Editar `.env` con tus credenciales de PostgreSQL:

```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=municipalidad_rrhh
DB_USER=postgres
DB_PASSWORD=tu_password

# Obligatorio, mínimo 32 caracteres. El servidor NO arranca si es corto.
JWT_SECRET=<genérelo aleatorio, ver abajo>

ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_DAYS=7
CORS_ORIGIN=http://localhost:3000
TRUST_PROXY=0
```

El resto de variables (conexión por `DATABASE_URL`, TLS, carpeta de archivos y
almacenamiento S3 compatible) están explicadas en `backend/.env.example`.

Genere el secreto así (nunca lo escriba a mano):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`TRUST_PROXY=1` solo si la API corre detrás de un proxy inverso (nginx, IIS).
Activarlo sin proxy permite que cualquiera falsee su IP con `X-Forwarded-For`,
esquive el límite de intentos de login y ensucie la auditoría.

Instalar dependencias e iniciar:

```bash
npm install
npm run dev       # desarrollo (nodemon)
# o
npm start         # producción
```

El backend quedará disponible en: `http://localhost:3001`

### 4. Iniciar el frontend

```bash
cd frontend
npm install
npm start
```

La aplicación quedará disponible en: `http://localhost:3000`

---

## Primer acceso

El repositorio **no contiene ninguna contraseña**. La primera cuenta la define
quien instala el sistema con `scripts/crear-admin.js` (paso 2 de la
instalación); ese usuario entra con el rol `admin`.

Las demás cuentas se crean desde la pantalla **Usuarios**, disponible solo para
el administrador. Para probar el rol `empleado`, cree un usuario y lígelo a un
empleado que ya tenga un año de servicio continuo; de lo contrario no podrá
solicitar vacaciones (ver la base legal más abajo).

## Roles y permisos

| Rol        | Alcance |
|------------|---------|
| `admin`    | Todo, **incluida la administración de cuentas de usuario** |
| `rrhh`     | Gestión de personal: empleados, solicitudes, vacaciones y consulta de auditoría. **No administra cuentas** |
| `empleado` | Únicamente sus propios datos: solicitudes, vacaciones y perfil |

> La administración de cuentas (crear usuarios, cambiar roles, restablecer
> contraseñas) queda reservada al rol `admin`. Si RRHH pudiera hacerlo, una sola
> cuenta de RRHH comprometida bastaría para volverse administrador.

---

## Estructura del proyecto

```
municipalidad-rrhh/
├── backend/
│   ├── src/
│   │   ├── config/        # Conexión a PostgreSQL
│   │   ├── controllers/   # Lógica de negocio
│   │   ├── middleware/    # JWT, control de roles y carga de archivos
│   │   ├── routes/        # Definición de endpoints
│   │   ├── services/      # Auditoría, notificaciones y bus SSE
│   │   └── utils/         # Días hábiles y regla de vacaciones
│   ├── scripts/
│   │   └── migrar.js      # Ejecutor de migraciones (admite --seco)
│   ├── uploads/           # Documentos y fotos (fuera de git)
│   ├── .env.example       # Plantilla de variables de entorno
│   └── server.js          # Punto de entrada
├── frontend/
│   └── src/
│       ├── components/    # Layout y campanita de notificaciones
│       ├── context/       # AuthContext (estado global)
│       ├── pages/         # Dashboard, Empleados, Solicitudes, Vacaciones,
│       │                  # Auditoría, Perfil, Login
│       └── services/      # Cliente HTTP con renovación automática de sesión
└── database/
    ├── schema.sql         # Estructura base: 14 tablas y 3 vistas
    ├── seed.sql           # Catálogos: departamentos, puestos y tipos de solicitud
    └── migrations/
        ├── 001_vacaciones_notificaciones_auditoria.sql
        ├── 002_departamentos_jalapa.sql
        ├── 003_correo_unico_empleados.sql
        ├── 004_tipos_documento_sin_dias.sql
        ├── 005_ficha_completa_empleado.sql
        ├── 006_eliminar_notas_pago.sql
        ├── 007_expediente_empleado.sql
        └── 008_acuerdo_vacaciones.sql   # Libro, folio y acuerdo de vacaciones
```

## Endpoints principales

| Método | Ruta                        | Descripción                  | Rol requerido |
|--------|-----------------------------|------------------------------|---------------|
| POST   | /api/auth/login             | Iniciar sesión               | Público       |
| GET    | /api/auth/perfil            | Ver perfil del usuario       | Autenticado   |
| GET    | /api/empleados              | Listar empleados             | RRHH / Admin  |
| POST   | /api/empleados              | Crear empleado               | RRHH / Admin  |
| PUT    | /api/empleados/:id          | Actualizar empleado          | RRHH / Admin  |
| PATCH  | /api/empleados/:id/baja     | Dar de baja a empleado       | RRHH / Admin  |
| GET    | /api/solicitudes            | Listar todas las solicitudes | RRHH / Admin  |
| GET    | /api/solicitudes/mias       | Solicitudes propias          | Autenticado   |
| POST   | /api/solicitudes            | Crear solicitud              | Autenticado   |
| PATCH  | /api/solicitudes/:id/estado | Aprobar o rechazar solicitud. Al aprobar vacaciones admite `libro`, `folio` y `numero_acuerdo` (si no se envía, se asigna el correlativo del año, p. ej. `01-2026`) | RRHH / Admin  |
| PATCH  | /api/solicitudes/:id/acta | Corrige libro, folio y acuerdo de una vacación ya aprobada (queda auditado) | RRHH / Admin  |
| GET    | /api/dashboard              | Estadísticas (se adaptan al rol) | Autenticado |
| GET    | /api/usuarios               | Listar cuentas de usuario    | **Admin**     |
| POST   | /api/usuarios               | Crear cuenta de usuario      | **Admin**     |
| PUT    | /api/usuarios/:id           | Cambiar rol o empleado ligado | **Admin**    |
| PATCH  | /api/usuarios/:id/password  | Restablecer contraseña       | **Admin**     |

### Vacaciones

| Método | Ruta                                  | Descripción                                | Rol requerido |
|--------|---------------------------------------|--------------------------------------------|---------------|
| GET    | /api/vacaciones                       | Saldo de todos los empleados activos       | RRHH / Admin  |
| GET    | /api/vacaciones/mi-saldo              | Saldo del empleado autenticado             | Autenticado   |
| GET    | /api/vacaciones/:id_empleado          | Saldos por año de un empleado              | Propio o RRHH |
| GET    | /api/vacaciones/:id_empleado/historial| Períodos gozados con fechas de inicio y fin| Propio o RRHH |
| GET    | /api/vacaciones/control-anual?anio=   | Control anual en Excel: libro, folio, acuerdo, salida y entrada | RRHH / Admin  |
| POST   | /api/vacaciones/generar               | Genera los registros del año               | RRHH / Admin  |
| PATCH  | /api/vacaciones/:id/saldo             | Ajuste manual del saldo (queda auditado)   | RRHH / Admin  |

### Solicitudes y documentos

| Método | Ruta                                    | Descripción                                  | Rol requerido |
|--------|-----------------------------------------|----------------------------------------------|---------------|
| GET    | /api/solicitudes/dias-habiles           | Previsualiza los días hábiles de un rango    | Autenticado   |
| GET    | /api/solicitudes/:id/documentos         | Lista los adjuntos de una solicitud          | Propio o RRHH |
| POST   | /api/solicitudes/:id/documentos         | Adjunta un documento (PDF o imagen, 10 MB)   | Propio o RRHH |
| DELETE | /api/solicitudes/:id/documentos/:idDoc  | Elimina un adjunto                           | Propio o RRHH |

### Expediente del empleado

Historial por persona que administra RRHH desde el botón **Expediente** de la
tabla de Empleados (sin entrada propia en el menú). Cuatro secciones:
capacitaciones, evaluaciones de desempeño, llamadas de atención y aviso de baja
ante el IGSS. Cada registro admite adjuntos (diploma, acta firmada, formulario).

| Método | Ruta                                              | Descripción                                        | Rol requerido |
|--------|---------------------------------------------------|----------------------------------------------------|---------------|
| GET    | /api/expediente/resumen                           | Avisos IGSS pendientes, sin evaluar, totales por departamento | RRHH / Admin |
| GET    | /api/expediente/mio                               | Expediente del empleado autenticado (Mi Perfil)    | Autenticado   |
| GET    | /api/expediente/:idEmpleado                       | Expediente completo con resumen                    | Propio o RRHH |
| POST   | /api/expediente/:idEmpleado/:seccion              | Registra en la sección                             | RRHH / Admin  |
| PUT    | /api/expediente/:idEmpleado/:seccion/:id          | Edita un registro                                  | RRHH / Admin  |
| DELETE | /api/expediente/:idEmpleado/:seccion/:id          | Elimina un registro y sus adjuntos                 | RRHH / Admin  |
| GET    | /api/expediente/:idEmpleado/:seccion/:id/documentos | Lista adjuntos                                   | Propio o RRHH |
| POST   | /api/expediente/:idEmpleado/:seccion/:id/documentos | Adjunta PDF o imagen (10 MB)                     | RRHH / Admin  |

`:seccion` es `capacitaciones`, `evaluaciones`, `llamadas` o `bajas-igss`.

- **Evaluaciones**: cinco criterios de 1 a 5; el promedio lo calcula PostgreSQL
  (columna generada) y el resultado se deriva: 4.50+ Excelente, 3.50+ Muy bueno,
  2.50+ Satisfactorio, menos: Necesita mejorar. Al registrarla se notifica al empleado.
- **Llamadas de atención**: verbal, escrita o grave. Tres o más en 12 meses marcan
  al empleado como reincidente en Reportes. Se notifica al empleado.
- **Baja IGSS**: al dar de baja a un empleado se abre automáticamente el aviso en
  estado *Pendiente* (misma transacción). RRHH lo marca *Presentado* con la fecha y
  el número de formulario. Los pendientes aparecen en el Dashboard y en Reportes.
- El empleado ve sus capacitaciones, evaluaciones y llamadas en **Mi Perfil**.

### Notificaciones, auditoría y sesión

| Método | Ruta                            | Descripción                                      | Rol requerido |
|--------|---------------------------------|--------------------------------------------------|---------------|
| GET    | /api/notificaciones             | Notificaciones del usuario                       | Autenticado   |
| GET    | /api/notificaciones/ticket      | Ticket de un solo uso para abrir el canal SSE    | Autenticado   |
| GET    | /api/notificaciones/stream      | Canal SSE en vivo (se autentica con el ticket)   | Ticket válido |
| PATCH  | /api/notificaciones/leer-todas  | Marca todas como leídas                          | Autenticado   |
| GET    | /api/auditoria                  | Rastro de acciones, con filtros y paginación     | RRHH / Admin  |
| POST   | /api/auth/refresh               | Renueva el token de acceso (rota el refresh)     | Público       |
| POST   | /api/auth/logout                | Revoca el refresh token                          | Autenticado   |
| POST   | /api/auth/foto                  | Sube la foto de perfil (JPG/PNG/WebP, 3 MB)      | Autenticado   |
| GET    | /api/empleados/:id/foto         | Entrega la foto (ruta autenticada)               | Propio o RRHH |

---

## Vacaciones: base legal

La Municipalidad **no se rige por el Código de Trabajo** sino por la
**Ley de Servicio Municipal (Decreto 1-87), artículo 44 inciso b)**:

> *"A gozar de un período de vacaciones remuneradas por cada año de servicios
> continuos en la forma siguiente: a 20 días hábiles, después de un año de
> servicios continuos; a 25 días hábiles, después de 5 años de servicio
> continuos. […] Las vacaciones no son acumulables de año en año […]"*

De ahí salen las reglas que aplica el sistema:

| Antigüedad al aniversario | Días hábiles |
|---------------------------|--------------|
| Menos de 1 año            | 0 (aún no adquiere el derecho) |
| De 1 a 4 años             | 20 |
| 5 años o más              | 25 |

- Se cuentan **días hábiles**: no consumen saldo los fines de semana ni los
  asuetos nacionales que `scripts/migrar.js` precarga en `dias_feriados`. Los de
  Semana Santa se calculan con el algoritmo de Pascua para cualquier año.
- El saldo **no se arrastra** de un año al siguiente.
- El descuento ocurre **al aprobar** la solicitud, dentro de una transacción. Si
  después se cancela o rechaza, los días se devuelven automáticamente.
- El 24 y 31 de diciembre no vienen precargados: la ley los declara asueto solo
  a partir del mediodía. Si la Municipalidad cierra completo, insértelos
  directamente en la tabla `dias_feriados`.

---

## Migraciones

```bash
cd backend
node scripts/migrar.js --seco   # simula y muestra los cambios, sin escribir
node scripts/migrar.js          # aplica
```

La migración `database/migrations/001` crea las tablas de asuetos y refresh
tokens, agrega las columnas de trazabilidad del descuento de vacaciones y la
foto de perfil, carga los asuetos nacionales y recalcula los saldos conforme al
artículo 44 b).

En una base nueva no hace falta nada de esto: `scripts/instalar-bd.js` aplica
`schema.sql`, `seed.sql` y las migraciones `002`, `007` y `008` (las `001` y
`003` a `006` ya vienen dentro de `schema.sql`), y solo corre `migrar.js` cuando
la base está vacía, para no tocar saldos ya ajustados por RRHH. Si parte de una
base antigua, aplique con psql únicamente la migración que le falte:

```bash
psql -U postgres -d municipalidad_rrhh -f database/migrations/008_acuerdo_vacaciones.sql
```

### Correo único por empleado (migración 003)

El correo identifica a la persona dentro de la Municipalidad: si dos
expedientes lo comparten, no se sabe a quién corresponde una notificación ni
una constancia. La migración `003`:

1. Normaliza los correos existentes (sin espacios, en minúsculas) y convierte
   los vacíos en `NULL`.
2. Libera los duplicados: conserva el correo en el expediente **más antiguo** y
   deja vacío el de los demás, **listando cuáles quedaron pendientes** para que
   RRHH les asigne el suyo desde la pantalla **Empleados**. No borra ningún otro dato.
3. Crea el índice único `empleados_correo_unico` sobre `LOWER(TRIM(correo))`.

A partir de ahí, intentar guardar un correo ya asignado devuelve **409** con el
código `CORREO_EN_USO` y un mensaje que nombra a la persona que lo tiene. La
pantalla de Empleados lo muestra junto al campo, en rojo, sin cerrar el
formulario. Los empleados **sin** correo no chocan entre sí: pueden ser varios.

### Trámites de documento vs. ausencias (migración 004)

No toda solicitud implica que el trabajador deje de asistir. La columna
`tipos_solicitud.es_ausencia` separa los dos casos:

| `es_ausencia` | Tipos | Formulario | Días |
|---------------|-------|------------|------|
| `TRUE` | Vacaciones, Permiso con goce, Permiso sin goce, Permiso médico, Suspensión disciplinaria | Fecha inicio + fecha fin | Cuenta días hábiles |
| `FALSE` | Constancia laboral, Constancia de ingresos, Carnet IRTRA, Alta y Baja de empleado | Una sola **fecha de solicitud** | Siempre 0 |

Una constancia laboral o de ingresos es un papel que extiende Recursos
Humanos: el trabajador sigue asistiendo, así que pedirle un rango de fechas y
anotarle días hábiles no tiene sentido. El servidor **descarta** cualquier
`fecha_fin` que llegue para un tipo de documento, venga del formulario o de una
llamada directa a la API.

Solo **Vacaciones** descuenta saldo, y eso no cambia.

Un tipo nuevo nace con `es_ausencia = TRUE` (el caso habitual); quien lo cree
decide si es un trámite de documento.

### Ficha completa del empleado (migración 005)

La Dirección de Recursos Humanos llevaba el registro del personal en una hoja
de Excel de unas 60 columnas. La migración `005` agrega a `empleados` las que
faltaban, para que la ficha del sistema reemplace ese archivo. La pantalla
**Empleados** las presenta en seis secciones: Datos personales, Puesto y
contrato, Profesión, Reinstalaciones, Sueldo y Expediente.

| Sección | Columnas nuevas |
|---------|-----------------|
| Puesto y contrato | `direccion_municipal`, `puesto_funcional`, `renglon`, `ubicacion_fisica`, `jornada`, `situacion` |
| Profesión | `profesion`, `colegiado`, `profesion_observacion` |
| Datos personales | `estado_civil`, `nit`, `igss` |
| Reinstalaciones | `reinstalacion_2012`, `_2016`, `_2017`, `_2018`, `_2019`, `_2022`, `_2024` |
| Sueldo | `bonificacion_37_2001`, `sueldos_anio`, `sueldo_enero` … `sueldo_diciembre` |
| Expediente | `analisis_expediente`, `observacion_expediente`, `rtu_vence`, `boleto_ornato_vence`, `cgc_vence`, `antecedentes_penales_vence`, `antecedentes_policiacos_vence` |

Lo que ya existía no se duplicó: `fecha_ingreso`, `nombres`/`apellidos`, `dpi`,
`fecha_nacimiento`, `genero` (SEXO), `correo`, `telefono`, `direccion`
(DIRECCIÓN RESIDENCIAL), `id_puesto` (PUESTO NOMINAL), `id_departamento`
(DEPENDENCIA DONDE LABORA) y `salario_base` (SUELDO BASE).

Tres diferencias respecto del Excel, deliberadas:

1. **ACTIVO / PASIVO / FALLECIDO** eran tres columnas, pero se excluyen entre
   sí. Aquí es una sola, `situacion`, para que ninguna ficha quede con dos
   casillas marcadas. Es distinta de `estado`, que dice si la ficha sigue
   vigente en el sistema.
2. **SIN FALTAS / FALTA LEVE / FALTA GRAVE**, por lo mismo, es una sola:
   `analisis_expediente`.
3. De **RTU, boleto de ornato, constancia de la CGC y antecedentes** se guarda
   únicamente la **fecha de vencimiento**: esa fecha ya dice de qué año es el
   documento y si sigue vigente, así que no hace falta una columna por año. El
   formulario marca en ámbar los que ya vencieron.

Todas las columnas admiten `NULL`: las fichas que ya existían siguen siendo
válidas y RRHH completa los datos a su ritmo. La bitácora de auditoría registra
estos campos igual que los demás: solo los que de verdad cambiaron.

### Recuperar el acceso de administrador

Si se pierde la contraseña del administrador, `crear-admin.js` la restablece y
cierra todas las sesiones abiertas de esa cuenta:

```bash
cd backend
ADMIN_PASSWORD="NuevaClaveSegura2026" node scripts/crear-admin.js
```

---

## Seguridad

Decisiones aplicadas y por qué:

| Medida | Motivo |
|--------|--------|
| Contraseñas con bcrypt (coste 10) | Nunca se almacenan ni se registran en claro |
| Token de acceso de 15 min + refresh rotativo de 7 días | Limita la ventana de uso de un token robado |
| Refresh guardado como SHA-256 y de un solo uso | Si se filtra la tabla, los tokens no son reutilizables |
| Reúso de un refresh revocado cierra **todas** las sesiones | Trata el reúso como indicio de robo |
| Restablecer contraseña o desactivar una cuenta revoca sus sesiones | Una sesión robada no sobrevive al cambio de contraseña |
| Administración de cuentas solo para `admin` | Evita que RRHH escale a administrador |
| Toda consulta con parámetros (`$1, $2…`) | Cierra la inyección SQL |
| Propiedad verificada en el servidor, no en el body | Un empleado no puede leer expedientes ajenos cambiando un id en la URL |
| Nombre de archivo generado por el servidor y MIME en lista blanca | Evita la escritura fuera de `uploads/` y la subida de ejecutables |
| Archivos servidos por ruta autenticada, nunca como estáticos | No se accede a un documento adivinando la URL |
| Límite de 10 intentos **fallidos** de login por IP cada 15 min | Frena la fuerza bruta sin bloquear a la oficina que acierta |
| `helmet`, CORS por origen fijo y errores sin traza de pila | Endurece cabeceras y evita filtrar detalles internos |
| Auditoría de toda acción sensible, con IP y responsable | Da no repudio: quién hizo qué y cuándo |
| Correo único por empleado, en la aplicación y en la base | Evita que dos expedientes compartan identidad de contacto |

Queda documentado como decisión consciente que los tokens se guardan en
`localStorage`: simplifica el desarrollo y no hay puntos de inyección de HTML en
la interfaz (React escapa por omisión y no se usa `dangerouslySetInnerHTML`).
Para un despliegue expuesto a internet, la alternativa recomendada es una cookie
`httpOnly` + `SameSite=Strict` con protección CSRF.

---

## Despliegue

El sistema son **tres piezas** que se publican por separado: la base de datos,
la API y el frontend. Cada una necesita saber dónde están las otras.

### 1. Base de datos

Cree una instancia de PostgreSQL gestionada (Neon, Render, Railway o el
servidor de la Municipalidad) y, desde `backend/` en su computadora, cargue todo
con el instalador apuntando a esa base:

```bash
DATABASE_URL="postgres://usuario:clave@host/base?sslmode=require" ADMIN_PASSWORD="ClaveSeguraDelAdmin" node scripts/instalar-bd.js
```

Con `DATABASE_URL` definida la conexión usa TLS y **verifica el certificado**
del servidor (Neon usa certificados públicos; si su proveedor usa uno propio,
vea `DB_SSL_INSECURE` en `.env.example`). Sirve cualquier PostgreSQL 14 o
superior. El instalador recalcula saldos de vacaciones solo si la base está
vacía; repetirlo sobre una base en uso no modifica nada.

### 2. API (backend)

Servicio Node con `npm install` y `npm start`. El archivo `render.yaml` de la
raíz declara el servicio para Render (Blueprint) con estas variables; en otro
proveedor se definen a mano:

| Variable | Valor | Por qué |
|----------|-------|---------|
| `DATABASE_URL` | La cadena del paso 1 | Activa TLS automáticamente |
| `JWT_SECRET` | 48 bytes aleatorios | **El servidor no arranca sin esto** |
| `CORS_ORIGIN` | La URL exacta del frontend | Sin ella el navegador bloquea las peticiones |
| `TRUST_PROXY` | `1` | La API queda detrás del proxy del proveedor |
| `NODE_ENV` | `production` | Activa CSP y HSTS |
| `PORT` | Lo asigna el proveedor | No fijarlo a mano |
| `STORAGE_S3_*` | Bucket S3 compatible | Sin ellas, los archivos se guardan en el disco efímero del servicio (ver abajo) |

Render despliega la **rama por defecto** del repositorio de GitHub. Suba el
código a esa rama (o fije `branch:` en `render.yaml`). En el plan gratuito el
servicio se apaga tras 15 minutos sin tráfico y la primera petición tarda entre
30 y 60 segundos; el frontend lo avisa en la pantalla de inicio de sesión.

Genere el secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Frontend

Sitio estático. Comando de compilación `npm run build`, carpeta publicada
`build`. El archivo `frontend/vercel.json` trae la regla de reescritura para
React Router y las cabeceras de seguridad. Una sola variable:

```env
REACT_APP_API_URL=https://<su-api>/api
```

> Las variables `REACT_APP_*` se incrustan **al compilar**, no al arrancar. Si
> la cambia después, hay que volver a compilar.

En Vercel configure **Root Directory = `frontend`**; de lo contrario no
encuentra `package.json` ni aplica `vercel.json`.

La URL de la API debe ser la misma en tres lugares, sin barra final:
`REACT_APP_API_URL` (Vercel), `connect-src` de la CSP en `frontend/vercel.json`
y, en sentido contrario, `CORS_ORIGIN` en Render con la URL del frontend.
Terminado esto, vuelva al backend y ponga `CORS_ORIGIN` con la URL real del
frontend. Pruebe el inicio de sesión desde el dominio definitivo antes de
compartir el enlace.

### Dónde se guardan los archivos subidos

Fotos y documentos adjuntos pasan por `backend/src/services/almacenamiento.js`,
que elige el proveedor según el entorno:

- **Local** (sin configurar nada): carpeta `UPLOADS_DIR`, por defecto
  `backend/uploads/`. Válido en la computadora o en un servidor propio de la
  Municipalidad. En Render el disco es efímero: cada despliegue o reinicio
  borra la carpeta y los archivos se pierden aunque el registro siga en la base.
- **S3 compatible** (recomendado en la nube): se activa con solo definir
  `STORAGE_S3_BUCKET`. Funciona con Neon Object Storage (el bucket se crea junto
  con la base de datos), Cloudflare R2, Supabase Storage, Backblaze B2 o AWS S3.
  Variables:

| Variable | Valor |
|----------|-------|
| `STORAGE_S3_BUCKET` | Nombre del bucket; su sola presencia activa S3 |
| `STORAGE_S3_ENDPOINT` | Neon: `https://<rama>.storage.<region>.aws.neon.tech` (lo muestra Connect → Storage); R2: `https://<cuenta>.r2.cloudflarestorage.com`; vacío en AWS |
| `STORAGE_S3_REGION` | `auto` en R2; la región real en AWS o B2 |
| `STORAGE_S3_ACCESS_KEY` / `STORAGE_S3_SECRET_KEY` | Credenciales del bucket |
| `STORAGE_S3_FORCE_PATH_STYLE` | `1` para Neon Object Storage, Supabase o MinIO |

Al arrancar, la API imprime qué proveedor quedó activo.

### Lista de verificación antes de publicar

- [ ] `JWT_SECRET` nuevo y aleatorio, distinto al de desarrollo
- [ ] `CORS_ORIGIN` con la URL real del frontend (sin barra final)
- [ ] `TRUST_PROXY=1` y `NODE_ENV=production`
- [ ] `REACT_APP_API_URL` apuntando a la API, y frontend recompilado
- [ ] Contraseña del administrador cambiada con `crear-admin.js`
- [ ] El archivo `.env` **no** subido al repositorio (ya está en `.gitignore`)
- [ ] Probado el ciclo completo: entrar, crear solicitud, aprobar, cerrar sesión
- [ ] Bucket S3 compatible configurado (`STORAGE_S3_*`), o asumido que los adjuntos no persisten
- [ ] Root Directory `frontend` en Vercel y la URL de la API en `vercel.json`
- [ ] La rama con el código final es la rama por defecto del repositorio

---

## Pruebas

Pruebas unitarias e integración HTTP del backend con Jest y Supertest, con la
base de datos simulada (no tocan PostgreSQL):

```bash
cd backend
npm test            # ejecuta la suite
npm run test:cov    # con reporte de cobertura
```

La suite cubre reglas de vacaciones, solapamiento de solicitudes, tope de
rango de fechas, rotación de refresh tokens, baja de empleados, subida y
almacenamiento de archivos.

## Documentación del proyecto

La documentación del trabajo de graduación (manual de usuario con capturas,
pruebas, instrumentos del estudio de campo, capítulos de la tesis y el Word
final) se mantiene fuera del repositorio, en la carpeta
`Proyecto graduacion docs` del autor, para no publicar datos de la
Municipalidad junto con el código.

## Diseño adaptable

La interfaz funciona en teléfono, tableta y escritorio:

- Bajo 768 px el menú lateral se convierte en un panel que se abre con el botón
  de la barra superior, se cierra al elegir una opción y bloquea el fondo mientras
  está abierto.
- Las rejillas de formulario pasan a una columna con
  `repeat(auto-fit, minmax(…))`, sin necesidad de media queries.
- Las tablas anchas se desplazan **dentro de su tarjeta**; la página nunca se
  mueve de lado.
- Los campos usan 16 px en móvil: con menos, Safari de iPhone hace zoom al
  enfocarlos y descuadra la pantalla.

Como el proyecto usa estilos en línea (donde no existen las media queries), el
punto de corte se evalúa en JavaScript con el hook `src/hooks/useMedia.js`.

---

## Autor

Gustavo Cortez  
Ingeniería en Sistemas  
Universidad Mariano Gálvez de Guatemala — Sede Jalapa  
2026
