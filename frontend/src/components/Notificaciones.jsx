import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { BASE_URL } from '../services/api';

/**
 * Campanita de notificaciones en vivo.
 *
 * El canal es SSE (EventSource). Como EventSource no permite mandar cabeceras,
 * no se puede enviar el "Authorization: Bearer": primero se pide un ticket de
 * un solo uso con el token normal y ese ticket abre el canal.
 *
 * Ese ticket se consume al conectar, así que la reconexión automática que trae
 * EventSource siempre fallaría con 401. Por eso se desactiva (se cierra en el
 * onerror) y se reconecta a mano pidiendo un ticket nuevo, con espera creciente.
 */
const RECONEXION_BASE_MS = 2000;
const RECONEXION_MAX_MS = 30000;

const tiempoRelativo = (fecha) => {
  const seg = Math.floor((Date.now() - new Date(fecha)) / 1000);
  if (seg < 60) return 'hace un momento';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return new Date(fecha).toLocaleDateString('es-GT');
};

export default function Notificaciones() {
  const [lista, setLista] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [conectado, setConectado] = useState(false);

  const navigate = useNavigate();
  const fuenteRef = useRef(null);
  const reintentoRef = useRef(null);
  const esperaRef = useRef(RECONEXION_BASE_MS);
  const vivoRef = useRef(true);
  const cajaRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/notificaciones');
      setLista(data.notificaciones);
      setNoLeidas(data.no_leidas);
    } catch {
      // Silencioso: la campanita no debe romper la pantalla.
    }
  }, []);

  const conectar = useCallback(async () => {
    if (!vivoRef.current) return;
    try {
      const { data } = await api.get('/notificaciones/ticket');
      if (!vivoRef.current) return;

      const fuente = new EventSource(`${BASE_URL}/notificaciones/stream?ticket=${data.ticket}`);
      fuenteRef.current = fuente;

      fuente.addEventListener('conectado', (e) => {
        setConectado(true);
        esperaRef.current = RECONEXION_BASE_MS;
        try { setNoLeidas(JSON.parse(e.data).no_leidas ?? 0); } catch { /* sin datos */ }
      });

      fuente.addEventListener('notificacion', (e) => {
        try {
          const noti = JSON.parse(e.data);
          setLista((previo) => [noti, ...previo].slice(0, 30));
          setNoLeidas((n) => n + 1);
          toast(noti.titulo, { icon: '🔔', duration: 5000 });
        } catch { /* evento malformado */ }
      });

      fuente.onerror = () => {
        setConectado(false);
        fuente.close();               // evita el reintento automático, que fallaría por el ticket usado
        if (!vivoRef.current) return;
        reintentoRef.current = setTimeout(conectar, esperaRef.current);
        esperaRef.current = Math.min(esperaRef.current * 2, RECONEXION_MAX_MS);
      };
    } catch {
      if (!vivoRef.current) return;
      reintentoRef.current = setTimeout(conectar, esperaRef.current);
      esperaRef.current = Math.min(esperaRef.current * 2, RECONEXION_MAX_MS);
    }
  }, []);

  useEffect(() => {
    vivoRef.current = true;
    cargar();
    conectar();
    return () => {
      vivoRef.current = false;
      clearTimeout(reintentoRef.current);
      fuenteRef.current?.close();
    };
  }, [cargar, conectar]);

  // Cerrar el panel al hacer clic fuera
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (cajaRef.current && !cajaRef.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const marcarLeida = async (id) => {
    try {
      const { data } = await api.patch(`/notificaciones/${id}/leer`);
      setLista((p) => p.map((n) => (n.id === id ? { ...n, leida: true } : n)));
      setNoLeidas(data.no_leidas);
    } catch { /* se reintenta al recargar */ }
  };

  const marcarTodas = async () => {
    try {
      await api.patch('/notificaciones/leer-todas');
      setLista((p) => p.map((n) => ({ ...n, leida: true })));
      setNoLeidas(0);
    } catch { /* se reintenta al recargar */ }
  };

  const abrirSolicitud = (noti) => {
    if (!noti.leida) marcarLeida(noti.id);
    setAbierto(false);
    if (noti.id_solicitud) navigate('/mis-solicitudes');
  };

  return (
    <div style={s.contenedor} ref={cajaRef}>
      <button
        style={s.boton}
        onClick={() => { setAbierto((v) => !v); if (!abierto) cargar(); }}
        title={conectado ? 'Notificaciones en vivo' : 'Reconectando...'}
        aria-label={`Notificaciones${noLeidas ? `, ${noLeidas} sin leer` : ''}`}
      >
        <Bell size={20} />
        {noLeidas > 0 && <span style={s.globo}>{noLeidas > 99 ? '99+' : noLeidas}</span>}
      </button>

      {abierto && (
        <div style={s.panel}>
          <div style={s.cabecera}>
            <span style={s.titulo}>Notificaciones</span>
            <span style={s.estado} title={conectado ? 'Canal en vivo activo' : 'Sin conexión en vivo'}>
              {conectado ? <Wifi size={13} color="#16a34a" /> : <WifiOff size={13} color="#94a3b8" />}
            </span>
            {noLeidas > 0 && (
              <button style={s.accion} onClick={marcarTodas} title="Marcar todas como leídas">
                <CheckCheck size={14} /> Leer todas
              </button>
            )}
          </div>

          <div style={s.lista}>
            {lista.length === 0 && <p style={s.vacio}>No tienes notificaciones.</p>}
            {lista.map((n) => (
              <button
                key={n.id}
                style={{ ...s.item, ...(n.leida ? {} : s.itemNoLeido) }}
                onClick={() => abrirSolicitud(n)}
              >
                <div style={s.itemFila}>
                  <span style={{ ...s.itemTitulo, fontWeight: n.leida ? 500 : 700 }}>{n.titulo}</span>
                  {!n.leida && <Check size={13} style={{ flexShrink: 0, opacity: 0.5 }} />}
                </div>
                <p style={s.itemMensaje}>{n.mensaje}</p>
                <span style={s.itemFecha}>{tiempoRelativo(n.creado_en)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  contenedor: { position: 'relative' },
  boton: {
    background: 'transparent', border: 'none', color: '#94b8e0', cursor: 'pointer',
    padding: '6px', borderRadius: '8px', display: 'flex', position: 'relative',
  },
  globo: {
    position: 'absolute', top: 0, right: 0, background: '#dc2626', color: '#fff',
    fontSize: '.65rem', fontWeight: 700, minWidth: '17px', height: '17px',
    borderRadius: '99px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px', lineHeight: 1,
  },
  panel: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 'min(360px, calc(100vw - 32px))',
    background: '#fff', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,.18)',
    border: '1px solid #e2e8f0', zIndex: 50, overflow: 'hidden',
  },
  cabecera: {
    display: 'flex', alignItems: 'center', gap: '.5rem',
    padding: '.75rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
  },
  titulo: { fontWeight: 700, fontSize: '.9rem', color: '#1e3a5f', flex: 1 },
  estado: { display: 'flex', alignItems: 'center' },
  accion: {
    background: 'transparent', border: 'none', color: '#0d9488', fontSize: '.75rem',
    fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.25rem',
  },
  lista: { maxHeight: '380px', overflowY: 'auto' },
  vacio: { padding: '1.5rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' },
  item: {
    display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
    border: 'none', borderBottom: '1px solid #f1f5f9', padding: '.7rem 1rem', cursor: 'pointer',
  },
  itemNoLeido: { background: '#f0fdfa' },
  itemFila: { display: 'flex', alignItems: 'center', gap: '.5rem' },
  itemTitulo: { fontSize: '.82rem', color: '#1e293b', flex: 1 },
  itemMensaje: { fontSize: '.75rem', color: '#64748b', margin: '.25rem 0', lineHeight: 1.4 },
  itemFecha: { fontSize: '.68rem', color: '#94a3b8' },
};
