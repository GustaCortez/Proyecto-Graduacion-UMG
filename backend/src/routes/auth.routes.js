const router = require('express').Router();
const { login, refrescar, logout, perfil, sesiones } = require('../controllers/auth.controller');
const { verificarToken } = require('../middleware/auth.middleware');
const { subirFoto } = require('../middleware/upload.middleware');
const foto = require('../controllers/foto.controller');

// Públicas
router.post('/login',   login);
router.post('/refresh', refrescar);

// Requieren sesión
router.post('/logout',   verificarToken, logout);
router.get('/perfil',    verificarToken, perfil);
router.get('/sesiones',  verificarToken, sesiones);

// Foto de perfil del usuario autenticado
router.post('/foto',   verificarToken, subirFoto, foto.subirMiFoto);
router.delete('/foto', verificarToken, foto.eliminarMiFoto);

module.exports = router;
