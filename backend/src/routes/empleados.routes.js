const router = require('express').Router();
const {
  getEmpleados, getEmpleadoById,
  crearEmpleado, actualizarEmpleado,
  bajaEmpleado, getCatalogos, getSiguienteCodigo
} = require('../controllers/empleados.controller');
const { verificarToken, soloRRHH } = require('../middleware/auth.middleware');
const foto = require('../controllers/foto.controller');

router.use(verificarToken); // todas las rutas requieren login

router.get('/',                  soloRRHH, getEmpleados);
router.get('/catalogos',         soloRRHH, getCatalogos);
router.get('/siguiente-codigo',  soloRRHH, getSiguienteCodigo);
router.get('/:id',               soloRRHH, getEmpleadoById);

// La foto sí la puede pedir el propio empleado: el control queda en el controlador.
router.get('/:id/foto',          foto.servir);

router.post('/',          soloRRHH, crearEmpleado);
router.put('/:id',        soloRRHH, actualizarEmpleado);
router.patch('/:id/baja', soloRRHH, bajaEmpleado);

module.exports = router;
