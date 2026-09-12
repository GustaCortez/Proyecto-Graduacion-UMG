const router = require('express').Router();
const {
  getEmpleados, getEmpleadoById,
  crearEmpleado, actualizarEmpleado,
  bajaEmpleado, getCatalogos, getSiguienteCodigo
} = require('../controllers/empleados.controller');
const { verificarToken, soloRRHH } = require('../middleware/auth.middleware');

router.use(verificarToken); // todas las rutas requieren login

router.get('/',                  soloRRHH, getEmpleados);
router.get('/catalogos',         soloRRHH, getCatalogos);
router.get('/siguiente-codigo',  soloRRHH, getSiguienteCodigo);
router.get('/:id',               soloRRHH, getEmpleadoById);
router.post('/',          soloRRHH, crearEmpleado);
router.put('/:id',        soloRRHH, actualizarEmpleado);
router.patch('/:id/baja', soloRRHH, bajaEmpleado);

module.exports = router;