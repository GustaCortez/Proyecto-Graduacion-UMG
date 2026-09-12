const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
require('dotenv').config();

const app = express();

// Middlewares globales
app.use(helmet());
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

//Rutas
app.use('/api/auth',       require('./src/routes/auth.routes'));
app.use('/api/empleados',  require('./src/routes/empleados.routes'));
app.use('/api/solicitudes',require('./src/routes/solicitudes.routes'));
app.use('/api/dashboard',  require('./src/routes/dashboard.routes'));
app.use('/api/usuarios',   require('./src/routes/usuarios.routes'));
app.use('/api/vacaciones',  require('./src/routes/vacaciones.routes'));
app.use('/api/notas-pago', require('./src/routes/notas_pago.routes'));

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'API Municipalidad funcionando' });
});

//Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});