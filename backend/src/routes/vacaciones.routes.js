const router = require('express').Router();
const { verificarToken, soloRRHH } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/vacaciones.controller');

router.use(verificarToken);

// Las rutas fijas van antes que las parametrizadas para que no las capture /:id_empleado
router.get('/',          soloRRHH, ctrl.getVacaciones);
router.get('/mi-saldo',            ctrl.getMiSaldo);
router.get('/simular',   soloRRHH, ctrl.simular);
router.get('/control-anual', soloRRHH, ctrl.controlAnual);
router.post('/generar',  soloRRHH, ctrl.generarAnio);

router.get('/:id_empleado',           ctrl.getVacacionesPorEmpleado);
router.get('/:id_empleado/historial', ctrl.getHistorial);

router.patch('/:id/saldo', soloRRHH, ctrl.actualizarSaldo);

module.exports = router;
