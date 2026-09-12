const router = require('express').Router();
const { verificarToken, soloRRHH } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/feriados.controller');

router.use(verificarToken);

// Cualquier usuario autenticado puede consultarlos: el empleado necesita saber
// que dias no le cuentan al pedir vacaciones.
router.get('/', ctrl.listar);

// Administrarlos es solo de RRHH/admin.
router.post('/',            soloRRHH, ctrl.crear);
router.post('/nacionales',  soloRRHH, ctrl.generarNacionales);
router.patch('/:id/estado', soloRRHH, ctrl.alternarEstado);
router.delete('/:id',       soloRRHH, ctrl.eliminar);

module.exports = router;
