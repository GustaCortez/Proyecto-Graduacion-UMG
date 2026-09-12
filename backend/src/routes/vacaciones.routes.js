const router = require('express').Router();
const { verificarToken, soloRRHH } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/vacaciones.controller');

router.use(verificarToken);

router.get('/',                      soloRRHH, ctrl.getVacaciones);
router.get('/:id_empleado',          ctrl.getVacacionesPorEmpleado);
router.patch('/:id/saldo',           soloRRHH, ctrl.actualizarSaldo);

module.exports = router;
