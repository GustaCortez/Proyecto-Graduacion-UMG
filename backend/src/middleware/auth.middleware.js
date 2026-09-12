const jwt = require('jsonwebtoken');
require('dotenv').config();

const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; //Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido.' });
  }
};

const soloAdmin = (req, res, next) => {
  if (!['admin', 'rrhh'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  next();
};

const soloRRHH = (req, res, next) => {
  if (!['admin', 'rrhh'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Solo personal RRHH.' });
  }
  next();
};

module.exports = { verificarToken, soloAdmin, soloRRHH };