const router = require('express').Router();
const { login, perfil } = require('../controllers/auth.controller');
const { verificarToken } = require('../middleware/auth.middleware');

router.post('/login',  login);
router.get('/perfil',  verificarToken, perfil);

module.exports = router;