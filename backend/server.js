const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
require('dotenv').config();

const app = express();

// Express queda detrás de un proxy en producción; sin esto req.ip devolvería
// siempre la IP del proxy y la auditoría registraría datos inútiles.
app.set('trust proxy', 1);

// Middlewares globales
app.use(helmet());
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));

// El ticket del canal SSE viaja en la URL; se oculta del log de acceso para
// que no quede escrito en disco.
morgan.token('url-limpia', (req) => req.originalUrl.replace(/ticket=[^&]+/, 'ticket=***'));
app.use(morgan(':method :url-limpia :status :response-time ms'));

app.use(express.json());

// Rutas
app.use('/api/auth',           require('./src/routes/auth.routes'));
app.use('/api/empleados',      require('./src/routes/empleados.routes'));
app.use('/api/solicitudes',    require('./src/routes/solicitudes.routes'));
app.use('/api/dashboard',      require('./src/routes/dashboard.routes'));
app.use('/api/usuarios',       require('./src/routes/usuarios.routes'));
app.use('/api/vacaciones',     require('./src/routes/vacaciones.routes'));
app.use('/api/notas-pago',     require('./src/routes/notas_pago.routes'));
app.use('/api/notificaciones', require('./src/routes/notificaciones.routes'));
app.use('/api/feriados',       require('./src/routes/feriados.routes'));
app.use('/api/auditoria',      require('./src/routes/auditoria.routes'));

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'API Municipalidad funcionando' });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Último recurso: cualquier error no capturado sale como JSON, nunca como
// traza de pila (que revelaría rutas internas del servidor).
app.use((err, req, res, next) => {
  console.error('[error no capturado]', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
