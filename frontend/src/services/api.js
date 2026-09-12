import axios from 'axios';

export const BASE_URL = 'http://localhost:3001/api';

const api = axios.create({ baseURL: BASE_URL });

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

// Agrega el token de acceso a cada petición
api.interceptors.request.use((config) => {
  const token = almacen.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Renovación automática de la sesión.
 *
 * El token de acceso dura 15 minutos. Cuando vence, el backend responde 401 con
 * codigo TOKEN_EXPIRADO; aquí se canjea el refresh token por uno nuevo y se
 * reintenta la petición original, sin que el usuario note nada.
 *
 * `renovando` evita la estampida: si varias peticiones vencen a la vez, solo
 * una llama a /auth/refresh y las demás esperan ese mismo resultado. Sin esto,
 * la rotación de tokens haría que la segunda llamada usara un token ya revocado
 * y el backend cerraría todas las sesiones por sospecha de robo.
 */
let renovando = null;

const cerrarSesion = () => {
  almacen.limpiar();
  if (window.location.pathname !== '/login') window.location.href = '/login';
};

async function renovarSesion() {
  const refreshToken = almacen.refresh;
  if (!refreshToken) throw new Error('sin refresh token');

  // Cliente aparte: no debe pasar por estos interceptores.
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

    // 403 = autenticado pero sin permiso. No es motivo para cerrar sesión.
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
    return Promise.reject(error);
  }
);

/** Descarga un recurso protegido y lo convierte en URL usable por <img> o <a>. */
export async function descargarComoUrl(ruta) {
  const { data } = await api.get(ruta, { responseType: 'blob' });
  return URL.createObjectURL(data);
}

export default api;
