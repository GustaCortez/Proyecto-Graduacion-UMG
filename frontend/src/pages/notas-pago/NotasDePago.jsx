import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Banknote, TrendingDown, TrendingUp } from 'lucide-react';

export default function NotasDePago() {
  const [notas, setNotas]   = useState([]);
  const [detalle, setDetalle] = useState(null);

  useEffect(() => {
    api.get('/notas-pago/mias').then(r => setNotas(r.data)).catch(() => {});
  }, []);

  const fmt = (val) =>
    Number(val || 0).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });

  return (
    <div>
      <h1 style={s.titulo}>Notas de Pago</h1>
      <p style={s.sub}>Historial de pagos quincenales</p>

      {!notas.length ? (
        <div style={s.vacio}>
          <Banknote size={40} color="#cbd5e1"/>
          <p style={{ color: '#94a3b8', marginTop: '.75rem' }}>No hay notas de pago registradas aún</p>
        </div>
      ) : (
        <div style={s.lista}>
          {notas.map(n => (
            <div key={n.id} style={s.card} onClick={() => setDetalle(detalle?.id === n.id ? null : n)}>
              <div style={s.cardHead}>
                <div style={s.iconWrap}>
                  <Banknote size={22} color="#fff"/>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={s.periodo}>{n.periodo}</p>
                  <p style={s.fecha}>Fecha de pago: {new Date(n.fecha_pago).toLocaleDateString('es-GT')}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={s.neto}>{fmt(n.total_neto)}</p>
                  <p style={{ fontSize: '.75rem', color: '#64748b' }}>Total neto</p>
                </div>
              </div>

              {detalle?.id === n.id && (
                <div style={s.desglose}>
                  <div style={s.fila}>
                    <span style={s.concepto}>Salario base</span>
                    <span style={s.monto}>{fmt(n.salario_base)}</span>
                  </div>
                  <div style={s.fila}>
                    <span style={s.concepto}>Bonificación incentivo</span>
                    <span style={{ ...s.monto, color: '#22c55e' }}>+ {fmt(n.bonificacion)}</span>
                  </div>
                  {Number(n.horas_extra) > 0 && (
                    <div style={s.fila}>
                      <span style={s.concepto}>Horas extra</span>
                      <span style={{ ...s.monto, color: '#22c55e' }}>+ {fmt(n.horas_extra)}</span>
                    </div>
                  )}
                  <div style={{ ...s.fila, borderTop: '1px dashed #e2e8f0', paddingTop: '.5rem' }}>
                    <span style={s.concepto}>Descuento IGSS</span>
                    <span style={{ ...s.monto, color: '#ef4444' }}>- {fmt(n.igss)}</span>
                  </div>
                  {Number(n.otros_descuentos) > 0 && (
                    <div style={s.fila}>
                      <span style={s.concepto}>Otros descuentos</span>
                      <span style={{ ...s.monto, color: '#ef4444' }}>- {fmt(n.otros_descuentos)}</span>
                    </div>
                  )}
                  <div style={{ ...s.fila, borderTop: '2px solid #e2e8f0', paddingTop: '.5rem', marginTop: '.25rem' }}>
                    <span style={{ ...s.concepto, fontWeight: 700, color: '#1e3a5f' }}>TOTAL NETO</span>
                    <span style={{ ...s.monto, fontWeight: 700, color: '#1e3a5f' }}>{fmt(n.total_neto)}</span>
                  </div>
                  {n.observaciones && (
                    <p style={s.obs}><strong>Observaciones:</strong> {n.observaciones}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  titulo:   { fontSize: '1.5rem', fontWeight: 700, color: '#1e3a5f' },
  sub:      { color: '#64748b', marginBottom: '1.5rem' },
  vacio:    { background: '#fff', borderRadius: '12px', padding: '3rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  lista:    { display: 'flex', flexDirection: 'column', gap: '.75rem' },
  card:     { background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,.1)', cursor: 'pointer', transition: 'box-shadow .15s' },
  cardHead: { display: 'flex', alignItems: 'center', gap: '1rem' },
  iconWrap: { background: '#1e3a5f', borderRadius: '10px', padding: '.65rem', display: 'flex', flexShrink: 0 },
  periodo:  { fontWeight: 600, color: '#1e293b', fontSize: '.95rem' },
  fecha:    { fontSize: '.8rem', color: '#64748b', marginTop: '.15rem' },
  neto:     { fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f' },
  desglose: { marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '.4rem' },
  fila:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  concepto: { fontSize: '.88rem', color: '#475569' },
  monto:    { fontSize: '.88rem', fontWeight: 600, color: '#1e293b' },
  obs:      { marginTop: '.75rem', fontSize: '.82rem', color: '#64748b', background: '#f8fafc', borderRadius: '6px', padding: '.5rem .75rem' },
};
