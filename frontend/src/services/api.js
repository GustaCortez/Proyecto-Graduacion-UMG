import axios from 'axios';

/**
 * En despliegue se define REACT_APP_API_URL (archivo .env del frontend o la
 * variable del servidor). El valor por defecto solo sirve en desarrollo:
 * dejarlo fijo obligaba a editar el codigo para publicar el sistema.
 */
export const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

/**
 * El plan gratuito de Render apaga el servidor tras un rato sin uso y la primera
 * petición puede tardar cerca de un minuto en despertarlo: con el timeout por
 * defecto (ninguno) la espera era indefinida; con uno corto fallaría siempre.
 */
const api = axios.create({ baseURL: BASE_URL, timeout: 60000 });

export const MENSAJE_SIN_CONEXION = 'No se pudo conectar con el servidor. Intente de nuevo en unos segundos.';

/** Verdadero cuando no hubo respuesta del servidor (caído, dormido o sin red). */
export const esErrorDeConexion = (err) =>
  !!err && (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK' || (!err.response && !!err.request));

/**
 * Mensaje para mostrar al usuario: el del backend si lo hay, el de conexión si
 * no hubo respuesta, o el genérico que indique la pantalla.
 */
export const mensajeDeError = (err, porDefecto = 'Ocurrió un error') => {
  if (esErrorDeConexion(err)) return MENSAJE_SIN_CONEXION;
  return err?.response?.data?.error || porDefecto;
};

export const almacen = {
  get token() { return localStorage.getItem('token'); },
  get refresh() { return localStorage.getItem('refreshToken'); },
  guardar(token, refreshToken, usuario) {
    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    if (usuario) localStorage.setItem('usuario', JSON.stringify(usuario));
  },
  limpiar() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('usuario');
  },
};

api.interceptors.request.use((config) => {
  const token = almacen.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Renovación automática: ante un 401 TOKEN_EXPIRADO se canjea el refresh token
 * y se reintenta la petición original.
 *
 * `renovando` evita la estampida: si varias peticiones vencen a la vez solo una
 * llama a /auth/refresh. Sin esto, la segunda usaría un token ya revocado y el
 * backend cerraría todas las sesiones por sospecha de robo.
 */
let renovando = null;

const cerrarSesion = () => {
  almacen.limpiar();
  if (window.location.pathname !== '/login') window.location.href = '/login';
};

async function renovarSesion() {
  const refreshToken = almacen.refresh;
  if (!refreshToken) throw new Error('sin refresh token');

  // Cliente aparte: no pasa por estos interceptores.
  const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
  almacen.guardar(data.token, data.refreshToken, data.usuario);
  return data.token;
}

api.interceptors.response.use(
  (respuesta) => respuesta,
  async (error) => {
    const original = error.config;
    const estado = error.response?.status;
    const codigo = error.response?.data?.codigo;

    const esRutaDeSesion = /\/auth\/(login|refresh)/.test(original?.url || '');

    // 403 = autenticado pero sin permiso: no se cierra sesión.
    if (estado === 403) return Promise.reject(error);

    if (estado === 401 && !esRutaDeSesion && !original._reintentado) {
      if (codigo === 'TOKEN_INVALIDO' || codigo === 'SIN_TOKEN') {
        if (!almacen.refresh) { cerrarSesion(); return Promise.reject(error); }
      }

      original._reintentado = true;
      try {
        if (!renovando) {
          renovando = renovarSesion().finally(() => { renovando = null; });
        }
        const nuevoToken = await renovando;
        original.headers.Authorization = `Bearer ${nuevoToken}`;
        return api(original);
      } catch {
        cerrarSesion();
        return Promise.reject(error);
      }
    }

    if (estado === 401 && !esRutaDeSesion) cerrarSesion();

    // Sin respuesta del servidor: se deja un mensaje legible para quien lo muestre.
    if (esErrorDeConexion(error)) error.mensajeUsuario = MENSAJE_SIN_CONEXION;
    return Promise.reject(error);
  }
);

export async function descargarComoUrl(ruta) {
  const { data } = await api.get(ruta, { responseType: 'blob' });
  return URL.createObjectURL(data);
}

export default api;
