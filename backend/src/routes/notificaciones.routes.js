const router = require('express').Router();
const { verificarToken } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/notificaciones.controller');

// El canal SSE no pasa por verificarToken: el navegador no puede mandar
// cabeceras en un EventSource. Se autentica con un ticket de un solo uso que
// se pide antes, ese si con el token normal.
router.get('/stream', ctrl.stream);

router.use(verificarToken);

router.get('/ticket',        ctrl.emitirTicket);
router.get('/',              ctrl.listar);
router.get('/contar',        ctrl.contar);
router.patch('/leer-todas',  ctrl.marcarTodas);
router.patch('/:id/leer',    ctrl.marcarLeida);

module.exports = router;
