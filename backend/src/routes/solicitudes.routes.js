const router = require('express').Router();
const {
  getSolicitudes, getSolicitudById,
  crearSolicitud, actualizarEstado, getTipos, getMisSolicitudes, previsualizarDias,
} = require('../controllers/solicitudes.controller');
const { verificarToken, soloRRHH } = require('../middleware/auth.middleware');
const docs = require('../controllers/documentos.controller');
const { subirDocumento } = require('../middleware/upload.middleware');

router.use(verificarToken);

// Rutas fijas primero, para que no las capture /:id
router.get('/',             soloRRHH, getSolicitudes);
router.get('/tipos',        getTipos);
router.get('/mias',         getMisSolicitudes);
router.get('/dias-habiles', previsualizarDias);

router.post('/',            crearSolicitud);
router.get('/:id',          getSolicitudById);
router.patch('/:id/estado', soloRRHH, actualizarEstado);

// Documentos adjuntos (ej. justificante medico)
router.get('/:id/documentos',             docs.listar);
router.post('/:id/documentos',            subirDocumento, docs.subir);
router.get('/:id/documentos/:idDoc',      docs.descargar);
router.delete('/:id/documentos/:idDoc',   docs.eliminar);

module.exports = router;
