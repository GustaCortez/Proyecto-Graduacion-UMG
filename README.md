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

Aplicar las migraciones (ver la sección **Migraciones** más abajo):

```bash
cd backend
npm install
node scripts/migrar.js
```

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
JWT_SECRET=un_secreto_largo_y_seguro
JWT_EXPIRES_IN=8h
```

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

## Credenciales de acceso (datos demo)

| Usuario    | Contraseña     | Rol      |
|------------|----------------|----------|
| admin      | Admin2026!     | Admin    |
| rrhh       | Admin2026!     | RRHH     |

> Cambiarlas en producción. Para probar el rol `empleado`, cree un usuario desde
> **Usuarios** y lígelo a un empleado que ya tenga un año de servicio continuo;
> de lo contrario no podrá solicitar vacaciones (ver la base legal más abajo).

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
│       │                  # Asuetos, Auditoría, Perfil, Login
│       └── services/      # Cliente HTTP con renovación automática de sesión
└── database/
    └── migrations/
        └── 001_vacaciones_notificaciones_auditoria.sql
```

> Pendiente: versionar `database/schema.sql` (estructura base) y `database/seed.sql`
> (datos de prueba). Hoy la estructura base solo existe en la base de datos.

## Endpoints principales

| Método | Ruta                        | Descripción                  | Rol requerido |
|--------|-----------------------------|------------------------------|---------------|
| POST   | /api/auth/login             | Iniciar sesión               | Público       |
| GET    | /api/auth/perfil            | Ver perfil del usuario       | Autenticado   |
| GET    | /api/empleados              | Listar empleados             | Autenticado   |
| POST   | /api/empleados              | Crear empleado               | RRHH / Admin  |
| PUT    | /api/empleados/:id          | Actualizar empleado          | RRHH / Admin  |
| PATCH  | /api/empleados/:id/baja     | Dar de baja a empleado       | RRHH / Admin  |
| GET    | /api/solicitudes            | Listar solicitudes           | Autenticado   |
| POST   | /api/solicitudes            | Crear solicitud              | Autenticado   |
| PATCH  | /api/solicitudes/:id/estado | Aprobar o rechazar solicitud | RRHH / Admin  |
| GET    | /api/dashboard              | Estadísticas generales       | Autenticado   |

### Vacaciones

| Método | Ruta                                  | Descripción                                | Rol requerido |
|--------|---------------------------------------|--------------------------------------------|---------------|
| GET    | /api/vacaciones                       | Saldo de todos los empleados activos       | RRHH / Admin  |
| GET    | /api/vacaciones/mi-saldo              | Saldo del empleado autenticado             | Autenticado   |
| GET    | /api/vacaciones/:id_empleado          | Saldos por año de un empleado              | Propio o RRHH |
| GET    | /api/vacaciones/:id_empleado/historial| Períodos gozados con fechas de inicio y fin| Propio o RRHH |
| POST   | /api/vacaciones/generar               | Genera los registros del año               | RRHH / Admin  |
| PATCH  | /api/vacaciones/:id/saldo             | Ajuste manual del saldo (queda auditado)   | RRHH / Admin  |

### Solicitudes, documentos y asuetos

| Método | Ruta                                    | Descripción                                  | Rol requerido |
|--------|-----------------------------------------|----------------------------------------------|---------------|
| GET    | /api/solicitudes/dias-habiles           | Previsualiza los días hábiles de un rango    | Autenticado   |
| GET    | /api/solicitudes/:id/documentos         | Lista los adjuntos de una solicitud          | Propio o RRHH |
| POST   | /api/solicitudes/:id/documentos         | Adjunta un documento (PDF o imagen, 10 MB)   | Propio o RRHH |
| DELETE | /api/solicitudes/:id/documentos/:idDoc  | Elimina un adjunto                           | Propio o RRHH |
| GET    | /api/feriados                           | Asuetos de un año                            | Autenticado   |
| POST   | /api/feriados                           | Registra un asueto (ej. la feria titular)    | RRHH / Admin  |
| POST   | /api/feriados/nacionales                | Carga los asuetos nacionales de un año       | RRHH / Admin  |

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
  asuetos registrados en `dias_feriados`. Los de Semana Santa se calculan con el
  algoritmo de Pascua para cualquier año.
- El saldo **no se arrastra** de un año al siguiente.
- El descuento ocurre **al aprobar** la solicitud, dentro de una transacción. Si
  después se cancela o rechaza, los días se devuelven automáticamente.
- El 24 y 31 de diciembre no vienen precargados: la ley los declara asueto solo
  a partir del mediodía. Si la Municipalidad cierra completo, agréguelos desde
  la pantalla **Asuetos**.

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

---

## Autor

Gustavo Cortez  
Ingeniería en Sistemas  
Universidad Mariano Gálvez de Guatemala — Sede Jalapa  
2026
