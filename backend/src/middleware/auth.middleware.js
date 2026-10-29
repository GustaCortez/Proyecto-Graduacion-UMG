const jwt = require('jsonwebtoken');
require('dotenv').config();


const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token requerido.', codigo: 'SIN_TOKEN' });
  }

  try {
    // Enforce accepted algorithms to avoid alg: none or unexpected algorithms.
    req.usuario = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'La sesión expiró.', codigo: 'TOKEN_EXPIRADO' });
    }
    return res.status(401).json({ error: 'Token inválido.', codigo: 'TOKEN_INVALIDO' });
  }
};


const soloAdmin = (req, res, next) => {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({
      error: 'Esta operación solo la puede realizar un administrador.', codigo: 'SIN_PERMISO' });
  }
  next();
};

/** Gestión de personal: administración y RRHH. */
const soloRRHH = (req, res, next) => {
  if (!['admin', 'rrhh'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Solo personal RRHH.', codigo: 'SIN_PERMISO' });
  }
  next();
};

module.exports = { verificarToken, soloAdmin, soloRRHH };
