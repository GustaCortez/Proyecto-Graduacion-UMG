import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
});

// Agrega token automáticamente a cada petición
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si token expira, redirigir al login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginEndpoint = error.config?.url?.includes('/auth/login');
    if (!isLoginEndpoint && (error.response?.status === 401 || error.response?.status === 403)) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;