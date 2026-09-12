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

  /**
   * Cierra la sesión también en el servidor: sin esto el refresh token seguiría
   * siendo válido hasta su vencimiento aunque el usuario creyera haber salido.
   */
  const logout = useCallback(async () => {
    const refreshToken = almacen.refresh;
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Si el servidor no responde igual se limpia el lado del cliente.
    }
    almacen.limpiar();
    setUsuario(null);
  }, []);

  /** Refresca los datos del usuario en memoria (por ejemplo, tras subir una foto). */
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
