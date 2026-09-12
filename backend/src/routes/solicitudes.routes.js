const router = require('express').Router();
const {
  getSolicitudes, getSolicitudById,
  crearSolicitud, actualizarEstado, getTipos, getMisSolicitudes
} = require('../controllers/solicitudes.controller');
const { verificarToken, soloRRHH } = require('../middleware/auth.middleware');

router.use(verificarToken);

router.get('/',          soloRRHH, getSolicitudes);
router.get('/tipos',     getTipos);
router.get('/mias',      getMisSolicitudes);
router.get('/:id',       getSolicitudById);
router.post('/',         crearSolicitud);
router.patch('/:id/estado', soloRRHH, actualizarEstado);

module.exports = router;