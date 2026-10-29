const crypto = require('crypto');
const notif = require('../services/notificaciones');
const sse = require('../services/sse');

/**
 * Tickets de un solo uso para abrir el canal SSE. EventSource no puede mandar
 * cabeceras, y poner el JWT en la URL lo dejaria en los logs; el cliente pide
 * un ticket con su token normal y lo canjea de inmediato (30 s, un solo uso).
 */
const tickets = new Map(); // ticket -> { id_usuario, expira }
const VIDA_TICKET_MS = 30 * 1000;

function limpiarVencidos() {
  const ahora = Date.now();
  for (const [t, datos] of tickets) {
    if (datos.expira <= ahora) tickets.delete(t);
  }
}
setInterval(limpiarVencidos, 60 * 1000).unref();

const emitirTicket = (req, res) => {
  limpiarVencidos();
  const ticket = crypto.randomBytes(24).toString('hex');
  tickets.set(ticket, { id_usuario: req.usuario.id, expira: Date.now() + VIDA_TICKET_MS });
  res.json({ ticket, expira_en_segundos: VIDA_TICKET_MS / 1000 });
};

const stream = async (req, res) => {
  const ticket = req.query.ticket;
  const datos = ticket ? tickets.get(ticket) : null;

  if (!datos || datos.expira <= Date.now()) {
    if (ticket) tickets.delete(ticket);
    return res.status(401).json({ error: 'Ticket inválido o vencido.' });
  }
  tickets.delete(ticket); // un solo uso

  const idUsuario = datos.id_usuario;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  sse.suscribir(idUsuario, res);

  try {
    const noLeidas = await notif.contarNoLeidas(idUsuario);
    res.write(`event: conectado\ndata: ${JSON.stringify({ no_leidas: noLeidas })}\n\n`);
  } catch {
    res.write(`event: conectado\ndata: {}\n\n`);
  }
};

const listar = async (req, res) => {
  try {
    const soloNoLeidas = req.query.no_leidas === 'true';
    const [registros, noLeidas] = await Promise.all([
      notif.listar(req.usuario.id, { soloNoLeidas, limite: req.query.limite }),
      notif.contarNoLeidas(req.usuario.id),
    ]);
    res.json({ no_leidas: noLeidas, notificaciones: registros });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener las notificaciones.' });
  }
};

const contar = async (req, res) => {
  try {
    res.json({ no_leidas: await notif.contarNoLeidas(req.usuario.id) });
  } catch (err) {
    res.status(500).json({ error: 'Error al contar las notificaciones.' });
  }
};

const marcarLeida = async (req, res) => {
  try {
    const ok = await notif.marcarLeida(req.usuario.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Notificacion no encontrada.' });
    res.json({ mensaje: 'Notificacion marcada como leida.', no_leidas: await notif.contarNoLeidas(req.usuario.id) });
  } catch (err) {
    res.status(500).json({ error: 'Error al marcar la notificacion.' });
  }
};

const marcarTodas = async (req, res) => {
  try {
    const n = await notif.marcarTodasLeidas(req.usuario.id);
    res.json({ mensaje: `${n} notificacion(es) marcadas como leidas.`, no_leidas: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Error al marcar las notificaciones.' });
  }
};

module.exports = { emitirTicket, stream, listar, contar, marcarLeida, marcarTodas };
