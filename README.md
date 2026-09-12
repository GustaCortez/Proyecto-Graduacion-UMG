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
| Seguridad  | bcrypt, Helmet, CORS              |


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

Aplicar el schema (estructura de tablas, vistas y triggers):

```bash
psql -U postgres -d municipalidad_rrhh -f database/schema.sql
```

Cargar los datos de prueba:

```bash
psql -U postgres -d municipalidad_rrhh -f database/seed.sql
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
| jgonzalez  | Empleado2026!  | Empleado |
| aherrera   | Empleado2026!  | Empleado |

> Estas credenciales corresponden al archivo `database/seed.sql`. Cambiarlas en producción.

---

## Estructura del proyecto

```
municipalidad-rrhh/
├── backend/
│   ├── src/
│   │   ├── config/        # Conexión a PostgreSQL
│   │   ├── controllers/   # Lógica de negocio
│   │   ├── middleware/     # JWT y control de roles
│   │   └── routes/        # Definición de endpoints
│   ├── .env.example       # Plantilla de variables de entorno
│   └── server.js          # Punto de entrada
├── frontend/
│   └── src/
│       ├── components/    # Layout y componentes reutilizables
│       ├── context/       # AuthContext (estado global)
│       ├── pages/         # Dashboard, Empleados, Solicitudes, Login
│       └── services/      # Cliente HTTP (axios)
└── database/
    ├── schema.sql          # Estructura completa de la BD
    └── seed.sql            # Datos de prueba
```

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

---

## Autor

Gustavo Cortez  
Ingeniería en Sistemas  
Universidad Mariano Gálvez de Guatemala — Sede Jalapa  
2026
