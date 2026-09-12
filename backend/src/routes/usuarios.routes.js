const router = require('express').Router();
const { verificarToken, soloAdmin } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/usuarios.controller');

router.use(verificarToken);
router.use(soloAdmin);

router.get('/',              ctrl.getUsuarios);
router.post('/',             ctrl.crearUsuario);
router.put('/:id',           ctrl.actualizarUsuario);
router.patch('/:id/estado',  ctrl.toggleEstado);
router.patch('/:id/password',ctrl.resetPassword);

module.exports = router;
