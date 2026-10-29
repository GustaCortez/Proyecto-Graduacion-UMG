/**
 * Utilidades de fecha para el frontend.
 *
 * El backend devuelve las columnas DATE como texto 'YYYY-MM-DD' (sin hora).
 * Si ese texto se pasa a `new Date(...)`, JavaScript lo interpreta en UTC y en
 * Guatemala (UTC-6) la fecha se muestra un día antes. Por eso aquí se toma
 * solo la parte de fecha del texto, sin construir un objeto Date.
 */

const dosDigitos = (n) => String(n).padStart(2, '0');

/**
 * Devuelve 'DD/MM/YYYY'. Acepta 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss...' o Date.
 * Para cadenas se recorta la parte de fecha; para Date se usa la hora local.
 * Valores vacíos o inválidos devuelven '—'.
 */
export function fechaCorta(valor) {
  if (!valor) return '—';

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return '—';
    return `${dosDigitos(valor.getDate())}/${dosDigitos(valor.getMonth() + 1)}/${valor.getFullYear()}`;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor));
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Fecha local de hoy como 'YYYY-MM-DD' (sin pasar por UTC). */
export function fechaHoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}
