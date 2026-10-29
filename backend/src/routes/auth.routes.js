const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { login, refrescar, logout, perfil, sesiones } = require('../controllers/auth.controller');
const { verificarToken } = require('../middleware/auth.middleware');
const { subirFoto } = require('../middleware/upload.middleware');
const foto = require('../controllers/foto.controller');

/**
 * Freno a la fuerza bruta. Solo cuentan los intentos FALLIDOS
 * (skipSuccessfulRequests): en la Municipalidad toda una oficina sale por la
 * misma IP publica, y contar tambien los aciertos dejaria sin servicio a los
 * companeros del que se equivoco de contrasena.
 */
const limiterLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos fallidos. Intente de nuevo en 15 minutos.' },
});

/**
 * La renovacion es legitima y frecuente (una por pestana cada 15 minutos), asi
 * que va con su propio limite holgado. Compartir el del login hacia que quien
 * erraba la contrasena tampoco pudiera renovar su sesion.
 */
const limiterRefresh = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas renovaciones de sesión. Espere unos minutos.' },
});

router.post('/login',   limiterLogin,   login);
router.post('/refresh', limiterRefresh, refrescar);

router.post('/logout',   verificarToken, logout);
router.get('/perfil',    verificarToken, perfil);
router.get('/sesiones',  verificarToken, sesiones);

router.post('/foto',   verificarToken, subirFoto, foto.subirMiFoto);
router.delete('/foto', verificarToken, foto.eliminarMiFoto);

module.exports = router;
