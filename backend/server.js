require('dotenv').config();

/**
 * Comprobaciones de arranque. Es preferible que el servidor no levante a que
 * levante inseguro: un JWT_SECRET corto o el de ejemplo permite firmar tokens
 * de administrador, y el fallo seria silencioso.
 */
const SECRETO_DE_EJEMPLO = 'cadena_larga_y_aleatoria_no_usar_esta';
const secreto = process.env.JWT_SECRET;

if (!secreto || secreto === SECRETO_DE_EJEMPLO || secreto.length < 32) {
  console.error(
    '\n[arranque cancelado] JWT_SECRET ausente, de ejemplo o demasiado corto.\n' +
    'Genere uno nuevo y pongalo en backend/.env:\n' +
    '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
  process.exit(1);
}

// En la nube la base viene como una sola cadena; en local, como variables sueltas.
if (!process.env.DATABASE_URL) {
  for (const clave of ['DB_HOST', 'DB_NAME', 'DB_USER']) {
    if (!process.env[clave]) {
      console.error(`\n[arranque cancelado] Falta ${clave} en backend/.env `
        + '(o defina DATABASE_URL con la cadena completa).\n');
      process.exit(1);
    }
  }
}

const app = require('./app');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
