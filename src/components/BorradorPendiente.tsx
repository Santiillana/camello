type Props = {
  fecha: string;
  onContinuar: () => void;
  onDescartar: () => void;
};

export default function BorradorPendiente({ fecha, onContinuar, onDescartar }: Props) {
  return (
    <div className="modal-flotante" role="dialog" aria-modal="true" aria-label="Borrador pendiente">
      <div className="tarjeta">
        <p className="texto-kicker">Borrador</p>
        <h2>Tienes un formulario sin terminar</h2>
        <p className="detalle-cliente">Guardado por última vez: {fecha}</p>
        <div className="fila-botones">
          <button type="button" className="boton-secundario" onClick={onDescartar}>Descartar</button>
          <button type="button" className="boton-primario" onClick={onContinuar}>Continuar</button>
        </div>
      </div>
    </div>
  );
}
