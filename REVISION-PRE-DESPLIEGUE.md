# Revisión previa al despliegue (29 de octubre de 2026)

**Actualización del mismo día:** todos los puntos de las secciones A y B quedaron corregidos (114 pruebas en verde, build sin advertencias). Quedan pendientes solo los de la sección C. Se conserva el detalle como registro de lo encontrado.

Estado verificado al inicio: 81 pruebas del backend en verde, el frontend compila para producción sin advertencias. Lo que sigue es lo que debía corregirse antes de enviar el enlace al Director de RRHH, ordenado por prioridad.

## A. Bloqueantes: corregir antes de enviar el enlace

| # | Problema | Dónde | Efecto para el Director | Corrección |
|---|---|---|---|---|
| A1 | Los archivos subidos (fotos, PDF adjuntos, expediente) se guardan en disco local. Render gratuito borra la carpeta en cada despliegue y cada vez que el servicio despierta. | backend/src/middleware/upload.middleware.js:12, render.yaml (plan free, sin disk) | Adjunta un documento y horas después ve "El archivo ya no está disponible". | Almacenamiento externo (Cloudinary o Supabase Storage) con memoryStorage, o plan de pago con disco persistente. |
| A2 | Dar de baja a un empleado no desactiva su usuario ni revoca sus sesiones. | backend/src/controllers/empleados.controller.js:525-541 | Un empleado despedido sigue entrando y creando solicitudes. | En la misma transacción: usuarios.activo = false y revocar refresh tokens. |
| A3 | Las fechas de solicitudes se muestran un día antes en Guatemala cuando el servidor corre en UTC (Render). | vista v_solicitudes (migración 008:30-31); Solicitudes.jsx:212, MisSolicitudes.jsx:250, MiPerfil.jsx:275 | Una vacación "del 15 al 19" aparece "del 14 al 18". En local no se nota. | TO_CHAR(fecha,'YYYY-MM-DD') en la vista, como ya hacen las demás consultas. |
| A4 | El repositorio no está listo para GitHub: sin remoto, 83 archivos sin commit, entre ellos app.js, render.yaml, vercel.json, schema.sql, instalar-bd.js, expediente.* | git status | Render y Vercel no tienen nada que desplegar; el último commit ni arranca. | Commit de todo, crear repo en GitHub, push de melvinrama y crear main desde ahí (o fijar branch en render.yaml). |
| A5 | Abrir el sistema en dos pestañas cierra la sesión en todas. El refresh token rotativo se comparte por localStorage y la segunda pestaña llega con el token ya rotado, lo que se interpreta como robo. | backend/src/controllers/auth.controller.js:141-150, frontend/src/services/api.js:41 | Cada 15 minutos puede quedar expulsado sin explicación si tiene dos pestañas. | Ventana de gracia de 30 s para el token recién rotado, o lock entre pestañas con navigator.locks. |

## B. Importantes: conviene corregir antes, no bloquean la demo

| # | Problema | Dónde | Corrección |
|---|---|---|---|
| B1 | asegurarRegistroAnual recalcula dias_asignados cada vez que se consulta el saldo y pisa los ajustes manuales de RRHH; si la fórmula da menos que dias_tomados, el empleado recibe error 500 permanente. | backend/src/utils/vacaciones.js:51-58 | ON CONFLICT DO NOTHING y recalcular solo desde "Generar año". |
| B2 | Reejecutar instalar-bd.js o migrar.js pone dias_tomados en 0 y recalcula para todos; además seed.sql rompe la transacción del instalador. | backend/scripts/instalar-bd.js:53,80; migrar.js:69-76 | Correr migrar.js solo con base vacía; envolver seed con sinTransaccion. |
| B3 | TLS hacia Neon sin verificar certificado (rejectUnauthorized false). | backend/src/config/db.js:24-26 | rejectUnauthorized true; false solo con variable explícita. |
| B4 | Cálculo de días hábiles sin tope: un rango de años bloquea la API para todos. | backend/src/utils/dias.js:89,113; solicitudes.controller.js:137 | Rechazar rangos mayores a 90 días. |
| B5 | Se aceptan solicitudes de vacaciones solapadas o duplicadas para las mismas fechas. | backend/src/controllers/solicitudes.controller.js:226-262 | Verificar solapamiento con Pendiente/En revisión/Aprobada antes de insertar y al aprobar. |
| B6 | 6 vulnerabilidades en dependencias (body-parser y multer altas). | backend/package.json | npm audit fix y recomitear package-lock. |
| B7 | La URL de la API está fija en tres sitios que deben coincidir exactamente: vercel.json (CSP connect-src), REACT_APP_API_URL y CORS_ORIGIN. Las previews de Vercel quedan bloqueadas. | frontend/vercel.json:21, backend/app.js:83 | Poner la URL real de Render tras crear el servicio; probar el login desde el dominio final. |
| B8 | Dashboard y Reportes no muestran "cargando" ni error. Con el arranque en frío de Render (30 a 60 s) el Director verá ceros. | Dashboard.jsx:16, Reportes.jsx:15 | Estado de carga y toast de error. |
| B9 | Botones de guardar sin bloqueo: doble clic crea registros duplicados. | Solicitudes.jsx:71, Empleados.jsx:271, Usuarios.jsx:25, Vacaciones.jsx:77 | Estado "enviando" + disabled como en MisSolicitudes.jsx. |
| B10 | Llamadas sin catch en Solicitudes.jsx: si falla, tabla vacía sin mensaje. | Solicitudes.jsx:29-34 | catch con toast. |
| B11 | Sin aviso durante el arranque lento del servidor en el login. | api.js:10, Login.jsx:61 | timeout 60 s y mensaje "el servidor está iniciando" tras 5 s. |
| B12 | schema.sql exige PostgreSQL 17 o superior (transaction_timeout). | database/schema.sql:25 | Crear Neon con PG 17, o quitar esa línea. |
| B13 | .env.example del backend no documenta DATABASE_URL, CORS_ORIGIN, TRUST_PROXY; README con recetas contradictorias y referencias a docs/ que ya no está en el repo (se movió a Descargas\Proyecto graduacion docs). | backend/.env.example, README.md | Actualizar ambos; una sola receta de instalación. |
| B14 | Vercel necesita Root Directory = frontend; .gitignore del frontend no excluye .env ni .env.production. | frontend/.gitignore | Documentar y usar .env* con excepción .env.example. |
| B15 | El panel de notificaciones se corta por la izquierda en teléfono. | Notificaciones.jsx:201 | Posición fija con márgenes en móvil. |

## C. Menores: mejoras que puede dejar para después

- Login no ejecuta bcrypt cuando el usuario no existe (permite enumerar usuarios); límite de intentos solo por IP, no por cuenta.
- Nadie puede cambiar su propia contraseña: solo el admin la resetea.
- Cualquier transición de estado es válida (Cancelada a Aprobada); el empleado no puede cancelar su propia solicitud pendiente.
- Fecha "hoy" calculada en UTC en Empleados.jsx:133 y Expediente.jsx:133 (después de las 18:00 precarga mañana).
- Validación de MIME confía en el Content-Type del cliente; multer escribe el archivo antes de verificar permisos.
- Fechas validadas con Date.parse aceptan textos y acaban en 500; ingreso el 29 de febrero genera fecha inválida.
- Sin manejo de SIGTERM ni unhandledRejection; pool sin connectionTimeout; logs de error sin ruta ni usuario.
- Textos: "Dashboard" en inglés, mezcla de tú y usted, "Formato no admitido. ." en MiPerfil.jsx:87, opción Asuetos en el filtro de Auditoría.
- Sin paginación en listados; window.open tras await puede bloquearse en iPhone; window.confirm nativo en tres pantallas.
- Plan gratuito de Render: primera carga de 30 a 60 s tras 15 minutos sin uso. Avisarlo al Director o usar un ping cada 10 minutos.

## Lo que está bien

Consultas parametrizadas en todo el backend, nombres de archivo generados por el servidor y protegidos contra path traversal, refresh tokens hasheados y rotativos, JWT con algoritmo forzado y arranque abortado sin secreto, helmet y HSTS, rate limit de login, control de propiedad por empleado en cada ruta, transacciones con FOR UPDATE y advisory lock al aprobar, notificaciones SSE emitidas solo tras COMMIT, auditoría que nunca tumba la operación, sin secretos en el repo, seed sin cuentas demo, migraciones idempotentes, vercel.json con rewrite SPA y CSP coherente, rutas protegidas por rol en el cliente y menú filtrado.
