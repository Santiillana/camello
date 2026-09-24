import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { database } from '../db/database';
import type { CarteraItem } from '../types';
import { formatoMoneda, hoyISO, inicioMesISO, inicioSemanaISO } from '../utils/format';
import AsistenteTarjetas from '../components/AsistenteTarjetas';
import MetodoPagoSelector, { type MetodoPagoCobro } from '../components/MetodoPagoSelector';
import BorradorPendiente from '../components/BorradorPendiente';
import { useBorrador } from '../hooks/useBorrador';

type Periodo = 'dia' | 'semana' | 'mes';

const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
];

export default function Cartera() {
  const [items, setItems] = useState<CarteraItem[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>('dia');
  const [clientePagar, setClientePagar] = useState<CarteraItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();

  const rango = useMemo(() => {
    const hoy = hoyISO();
    if (periodo === 'semana') return { desde: inicioSemanaISO(), hasta: hoy };
    if (periodo === 'mes') return { desde: inicioMesISO(), hasta: hoy };
    return { desde: hoy, hasta: hoy };
  }, [periodo]);

  async function cargar() {
    try {
      setItems(await database.listarCartera(rango.desde, rango.hasta));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, [rango.desde, rango.hasta]);

  useEffect(() => {
    const cliente = params.get('cliente');
    if (cliente) {
      const id = Number(cliente);
      const encontrado = items.find((item) => item.cliente_id === id);
      if (encontrado) setClientePagar(encontrado);
    }
  }, [items, params]);

  const total = items.reduce((sum, item) => sum + item.pendiente, 0);

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Cobros pendientes</p>
          <h1>Cartera</h1>
        </div>
      </header>

      <section className="periodo-selector" aria-label="Filtro de cartera">
        {PERIODOS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={'periodo-tab' + (periodo === item.id ? ' activo' : '')}
            onClick={() => setPeriodo(item.id)}
          >
            {item.label}
          </button>
        ))}
      </section>

      <section className="dashboard-total">
        <span className="texto-kicker">Total por cobrar</span>
        <strong>{formatoMoneda(total)}</strong>
        <span className="detalle-cliente">{items.length} cliente(s) con saldo en este periodo</span>
      </section>

      {error && <p className="texto-error">{error}</p>}

      {items.length === 0 ? (
        <p className="texto-vacio">No hay personas con pagos pendientes en este periodo.</p>
      ) : (
        <ul className="lista-cartera">
          {items.map((item) => (
            <li key={item.cliente_id} className="fila-cartera tarjeta">
              <div>
                <Link to={`/clientes/${item.cliente_id}`} className="enlace-principal">
                  <strong>{item.nombre}</strong>
                </Link>
                <span className="detalle-cliente">{item.ventas_pendientes} venta(s) pendiente(s)</span>
              </div>
              <div className="lado-derecho-cliente">
                <strong className="etiqueta-pendiente">{formatoMoneda(item.pendiente)}</strong>
                <div className="fila-botones">
                  {item.telefono1 && (
                    <a
                      className="boton-chip"
                      href={'https://wa.me/57' + item.telefono1.replace(/\D/g, '')}
                      target="_blank"
                      rel="noreferrer"
                    >
                      💬 WhatsApp
                    </a>
                  )}
                  <button className="boton-primario boton-chip-accion" type="button" onClick={() => setClientePagar(item)}>
                    Pagar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {clientePagar && (
        <PagoCartera
          item={clientePagar}
          onGuardado={async () => {
            setClientePagar(null);
            await cargar();
          }}
          onCancelar={() => setClientePagar(null)}
        />
      )}
    </div>
  );
}

function PagoCartera({
  item,
  onGuardado,
  onCancelar,
}: {
  item: CarteraItem;
  onGuardado: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [monto, setMonto] = useState(String(item.pendiente));
  const [metodo, setMetodo] = useState<MetodoPagoCobro>('EFECTIVO');
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasoInicial, setPasoInicial] = useState(0);
  const operacionRef = useRef<string | null>(null);
  const datosBorrador = { monto, metodo };
  const borrador = useBorrador<typeof datosBorrador>({
    tipo: 'pago-cartera',
    clave: String(item.cliente_id),
    datos: datosBorrador,
    paso: pasoInicial,
  });

  const tarjetas = [
    {
      id: 'monto',
      titulo: 'Monto',
      contenido: (
        <div className="formulario">
          <p className="detalle-cliente">Saldo de {item.nombre}: {formatoMoneda(item.pendiente)}</p>
          <label>
            ¿Cuánto paga?
            <input
              type="number"
              min={1}
              max={item.pendiente}
              step={1}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <button type="button" className="boton-secundario" onClick={() => setMonto(String(item.pendiente))}>
            Pagar total
          </button>
        </div>
      ),
      validar: () => {
        const valor = Number(monto);
        if (!Number.isSafeInteger(valor) || valor <= 0 || valor > item.pendiente) return 'El monto debe estar entre 1 y el saldo pendiente.';
        return null;
      },
    },
    {
      id: 'metodo',
      titulo: 'Método de pago',
      contenido: (
        <MetodoPagoSelector
          value={metodo}
          options={['EFECTIVO', 'TRANSFERENCIA_NEQUI']}
          onChange={setMetodo}
        />
      ),
    },
    {
      id: 'confirmar',
      titulo: 'Confirmar cobro',
      contenido: (
        <div className="resumen-venta">
          <div className="lista-resumen">
            <div><span>Cliente</span><strong>{item.nombre}</strong></div>
            <div><span>Monto</span><strong>{formatoMoneda(Number(monto))}</strong></div>
            <div><span>Método</span><strong>{metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia / Nequi'}</strong></div>
          </div>
          <button
            type="button"
            className="boton-primario boton-grande"
            disabled={pagando}
            onClick={() => void registrar()}
          >
            {pagando ? 'Registrando cobro…' : 'CONFIRMAR COBRO'}
          </button>
        </div>
      ),
      validar: () => null,
    },
  ];

  async function registrar() {
    if (pagando) return;
    setPagando(true);
    setError(null);
    if (!operacionRef.current) {
      operacionRef.current = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'cobro-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }
    try {
      await database.registrarPagoCliente(Number(item.cliente_id), Number(monto), metodo, operacionRef.current);
      await borrador.limpiar();
      await onGuardado();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPagando(false);
    }
  }

  if (error) {
    return (
      <section className="tarjeta modal-flotante">
        <p className="texto-error">{error}</p>
        <button className="boton-secundario" onClick={() => setError(null)}>Volver</button>
      </section>
    );
  }

  return (
    <section className="tarjeta modal-flotante">
      {borrador.pendiente && (
        <BorradorPendiente
          fecha={borrador.pendiente.updated_at}
          onDescartar={() => void borrador.descartar()}
          onContinuar={async () => {
            const pendiente = borrador.pendiente;
            if (!pendiente) return;
            const paso = await borrador.continuar();
            setMonto(pendiente.datos.monto);
            setMetodo(pendiente.datos.metodo);
            setPasoInicial(paso);
          }}
        />
      )}
      <AsistenteTarjetas
        titulo={'Pagar a ' + item.nombre}
        tarjetas={tarjetas}
        onCompletar={async () => { await registrar(); }}
        onCancelar={onCancelar}
        textoFinal="CONFIRMAR COBRO"
        pasoInicial={pasoInicial}
        onPasoChange={setPasoInicial}
        onGuardarBorrador={borrador.guardarAhora}
        onDescartarBorrador={borrador.descartar}
      />
    </section>
  );
}
