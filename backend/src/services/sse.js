/**
 * Bus de Server-Sent Events.
 *
 * Mantiene las conexiones abiertas por usuario para poder empujarles eventos
 * en el momento en que ocurren, sin que el navegador tenga que preguntar.
 * Se eligio SSE sobre WebSocket porque el flujo aqui es en un solo sentido
 * (servidor -> navegador) y no requiere dependencias adicionales.
 */

/** Map<id_usuario, Set<res>> */
const clientes = new Map();

/** Latido periodico: evita que proxys o el navegador corten la conexion por inactividad. */
const INTERVALO_LATIDO_MS = 25000;

function suscribir(idUsuario, res) {
  if (!clientes.has(idUsuario)) clientes.set(idUsuario, new Set());
  clientes.get(idUsuario).add(res);

  const latido = setInterval(() => {
    try { res.write(': latido\n\n'); } catch { /* la limpieza ocurre en el close */ }
  }, INTERVALO_LATIDO_MS);

  const cerrar = () => {
    clearInterval(latido);
    const conjunto = clientes.get(idUsuario);
    if (conjunto) {
      conjunto.delete(res);
      if (conjunto.size === 0) clientes.delete(idUsuario);
    }
  };

  res.on('close', cerrar);
  res.on('error', cerrar);
  return cerrar;
}

/** Envia un evento a todas las pestanas abiertas de un usuario. */
function emitir(idUsuario, evento, datos) {
  const conjunto = clientes.get(Number(idUsuario));
  if (!conjunto || conjunto.size === 0) return 0;

  const carga = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
  let enviados = 0;
  for (const res of conjunto) {
    try { res.write(carga); enviados++; } catch { conjunto.delete(res); }
  }
  return enviados;
}

/** Envia a varios usuarios a la vez (por ejemplo, avisar a todo RRHH). */
function emitirAVarios(idsUsuario, evento, datos) {
  return idsUsuario.reduce((n, id) => n + emitir(id, evento, datos), 0);
}

const conectados = () => clientes.size;

module.exports = { suscribir, emitir, emitirAVarios, conectados };
