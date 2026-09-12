const router = require('express').Router();
const { getDashboard } = require('../controllers/dashboard.controller');
const { verificarToken } = require('../middleware/auth.middleware');

router.get('/', verificarToken, getDashboard);

module.exports = router;