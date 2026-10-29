const router = require('express').Router();
const { verificarToken, soloRRHH } = require('../middleware/auth.middleware');
const { subirDocumento } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/expediente.controller');

router.use(verificarToken);

// Resumen institucional (Dashboard y Reportes) y expediente propio (Mi Perfil).
router.get('/resumen', soloRRHH, ctrl.resumen);
router.get('/mio',               ctrl.mio);

// El control "propio o RRHH" vive en el controlador.
router.get('/:idEmpleado', ctrl.obtener);

// :seccion = capacitaciones | evaluaciones | llamadas | bajas-igss
router.post(  '/:idEmpleado/:seccion',     soloRRHH, ctrl.crear);
router.put(   '/:idEmpleado/:seccion/:id', soloRRHH, ctrl.actualizar);
router.delete('/:idEmpleado/:seccion/:id', soloRRHH, ctrl.eliminar);

router.get(   '/:idEmpleado/:seccion/:id/documentos',                  ctrl.listarAdjuntos);
router.post(  '/:idEmpleado/:seccion/:id/documentos', soloRRHH, subirDocumento, ctrl.subirAdjunto);
router.get(   '/:idEmpleado/:seccion/:id/documentos/:idDoc',           ctrl.descargarAdjunto);
router.delete('/:idEmpleado/:seccion/:id/documentos/:idDoc', soloRRHH, ctrl.eliminarAdjunto);

module.exports = router;
