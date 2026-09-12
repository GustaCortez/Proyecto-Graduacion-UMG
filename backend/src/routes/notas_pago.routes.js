const router = require('express').Router();
const { getMisNotasPago, getNotasPago, crearNotaPago } = require('../controllers/notas_pago.controller');
const { verificarToken, soloRRHH } = require('../middleware/auth.middleware');

router.use(verificarToken);

router.get('/mias', getMisNotasPago);
router.get('/',     soloRRHH, getNotasPago);
router.post('/',    soloRRHH, crearNotaPago);

module.exports = router;
