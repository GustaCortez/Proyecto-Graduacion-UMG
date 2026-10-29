const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

/**
 * Aplicacion Express sin `listen`. Se separa de server.js para que las
 * pruebas (supertest) puedan montarla en memoria sin abrir un puerto.
 */

const app = express();

/**
 * No anunciar la tecnologia del servidor. Helmet ya lo quita, pero se deja
 * explicito para que el control siga vigente aunque se cambie de libreria.
 */
app.disable('x-powered-by');

/**
 * Solo confiar en X-Forwarded-For cuando de verdad hay un proxy delante. Si se
 * confia sin proxy, cualquiera puede mandar esa cabecera, falsear su IP y con
 * eso esquivar el limite de intentos de login y ensuciar la auditoria.
 */
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

/**
 * Cabeceras de seguridad con una sola configuracion explicita, igual en
 * desarrollo y en produccion: una API que responde distinto segun el entorno
 * es mas dificil de auditar. El HSTS sobre http://localhost lo ignora el
 * navegador, asi que mantenerlo activo en desarrollo no causa dano.
 */
app.use(helmet({
  // Content Security Policy: por defecto solo recursos del mismo origen.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  // HSTS: un ano, con subdominios y apto para precarga.
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  // No filtrar la URL de la API hacia sitios externos.
  referrerPolicy: { policy: 'no-referrer' },
}));

/**
 * Permissions-Policy: Helmet no la pone. La API no usa estas funciones del
 * navegador, asi que se niegan todas para reducir la superficie de abuso si
 * una respuesta llegara a interpretarse como documento.
 */
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy',
    'geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()');
  next();
});

/**
 * Las respuestas de la API llevan datos personales (perfiles, solicitudes,
 * auditoria). no-store evita que el navegador o un proxy intermedio las
 * guarden en cache y las sirvan a otra persona en un equipo compartido. Se
 * aplica a toda la API (solo sirve JSON, no estaticos); el endpoint de la foto
 * fija despues su propio Cache-Control (private, 5 min).
 */
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Origin configurable via env for production (e.g. https://app.example.com)
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

// El ticket del canal SSE viaja en la URL; no debe quedar en el log.
morgan.token('url-limpia', (req) => req.originalUrl.replace(/ticket=[^&]+/, 'ticket=***'));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(':method :url-limpia :status :response-time ms'));
}

// Sin limite explicito, el cuerpo por defecto (100 kb) queda a merced de la
// libreria. strict:true (el valor por defecto, aqui explicito) solo acepta
// objetos y arreglos como JSON de nivel superior.
app.use(express.json({ limit: '1mb', strict: true }));

/**
 * Freno general contra abuso automatizado. Es holgado a proposito: el login ya
 * tiene su propio limite estricto y esto solo debe frenar el escaneo masivo,
 * no el uso normal de una oficina que sale por una sola IP publica.
 */
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // El canal SSE es una conexion larga y persistente, no una rafaga.
  skip: (req) => req.path.startsWith('/notificaciones/stream'),
  message: { error: 'Demasiadas peticiones. Espere un momento e intente de nuevo.' },
}));

app.use('/api/auth',           require('./src/routes/auth.routes'));
app.use('/api/empleados',      require('./src/routes/empleados.routes'));
app.use('/api/solicitudes',    require('./src/routes/solicitudes.routes'));
app.use('/api/dashboard',      require('./src/routes/dashboard.routes'));
app.use('/api/usuarios',       require('./src/routes/usuarios.routes'));
app.use('/api/vacaciones',     require('./src/routes/vacaciones.routes'));
app.use('/api/notificaciones', require('./src/routes/notificaciones.routes'));
app.use('/api/auditoria',      require('./src/routes/auditoria.routes'));
app.use('/api/expediente',     require('./src/routes/expediente.routes'));

app.get('/', (req, res) => {
  res.json({ mensaje: 'API Municipalidad funcionando' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Nunca devolver la traza de pila al cliente.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  /**
   * Los errores del analizador de cuerpo (express.json) traen su propio codigo
   * HTTP: 413 si el cuerpo supera el limite de 1 MB y 400 si el JSON esta mal
   * formado. Son errores del cliente y deben responderse como tales; antes se
   * devolvian como 500 y el frontend los mostraba como caida del servidor.
   */
  const estado = Number(err.status || err.statusCode);
  if (estado >= 400 && estado < 500) {
    const mensaje = estado === 413
      ? 'El cuerpo de la petición supera el límite permitido (1 MB).'
      : err.type === 'entity.parse.failed'
        ? 'El cuerpo de la petición no es un JSON válido.'
        : 'Petición no válida.';
    return res.status(estado).json({ error: mensaje });
  }

  console.error('[error no capturado]', err.message);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
