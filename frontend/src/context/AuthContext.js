import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { almacen } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = almacen.token;
    const guardado = localStorage.getItem('usuario');
    if (token && guardado) {
      try {
        setUsuario(JSON.parse(guardado));
      } catch {
        almacen.limpiar();
      }
    }
    setCargando(false);
  }, []);

  const login = useCallback((token, datosUsuario, refreshToken) => {
    almacen.guardar(token, refreshToken, datosUsuario);
    setUsuario(datosUsuario);
  }, []);

  /** Cierra sesión también en el servidor; si no, el refresh token seguiría vivo. */
  const logout = useCallback(async () => {
    const refreshToken = almacen.refresh;
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
    }
    almacen.limpiar();
    setUsuario(null);
  }, []);

  const actualizarUsuario = useCallback((cambios) => {
    setUsuario((previo) => {
      const nuevo = { ...previo, ...cambios };
      localStorage.setItem('usuario', JSON.stringify(nuevo));
      return nuevo;
    });
  }, []);

  const esAdmin = ['admin', 'rrhh'].includes(usuario?.rol);

  return (
    <AuthContext.Provider value={{ usuario, login, logout, cargando, esAdmin, actualizarUsuario }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
