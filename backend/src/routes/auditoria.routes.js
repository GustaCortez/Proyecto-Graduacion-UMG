const router = require('express').Router();
const { verificarToken, soloAdmin } = require('../middleware/auth.middleware');
const auditoria = require('../services/auditoria');

// El rastro de auditoria es informacion sensible: solo administracion y RRHH.
router.use(verificarToken, soloAdmin);

router.get('/', async (req, res) => {
  try {
    const { limite, pagina, accion, tabla, id_usuario, desde, hasta } = req.query;
    const lim = Math.min(Number(limite) || 50, 200);
    const desplazamiento = ((Number(pagina) || 1) - 1) * lim;

    const datos = await auditoria.consultar({
      limite: lim, desplazamiento, accion, tabla, id_usuario, desde, hasta,
    });

    res.json({
      pagina: Number(pagina) || 1,
      limite: lim,
      total: datos.total,
      registros: datos.registros,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al consultar la auditoria.' });
  }
});

/** Catalogo de acciones, para poblar el filtro de la pantalla. */
router.get('/acciones', (req, res) => {
  res.json(Object.values(auditoria.ACCIONES));
});

module.exports = router;
