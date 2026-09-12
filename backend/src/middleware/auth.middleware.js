const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Códigos de error para que el cliente sepa qué hacer:
 *   TOKEN_EXPIRADO -> renovar con el refresh token y reintentar (401)
 *   TOKEN_INVALIDO -> cerrar sesión (401)
 *   SIN_PERMISO    -> el usuario está bien autenticado, pero su rol no alcanza (403)
 *
 * La distinción importa: antes un token vencido y una denegación por rol
 * devolvían ambos 403, así que el frontend no podía decidir entre renovar la
 * sesión o mandar al login.
 */

const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token requerido.', codigo: 'SIN_TOKEN' });
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'La sesión expiró.', codigo: 'TOKEN_EXPIRADO' });
    }
    return res.status(401).json({ error: 'Token inválido.', codigo: 'TOKEN_INVALIDO' });
  }
};

/** Exige rol administrativo. Hoy admin y rrhh comparten permisos. */
const soloAdmin = (req, res, next) => {
  if (!['admin', 'rrhh'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Acceso denegado.', codigo: 'SIN_PERMISO' });
  }
  next();
};

const soloRRHH = (req, res, next) => {
  if (!['admin', 'rrhh'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Solo personal RRHH.', codigo: 'SIN_PERMISO' });
  }
  next();
};

module.exports = { verificarToken, soloAdmin, soloRRHH };
