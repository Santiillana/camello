import { useEffect, useState } from 'react';
import { database } from '../db/database';
import { verificarHashPin } from '../utils/seguridad';

export default function PinLock({ onDesbloqueado }: { onDesbloqueado: () => void }) {
  const [pin,setPin]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [bloqueadoHasta,setBloqueadoHasta]=useState(0);
  const [seguridad,setSeguridad]=useState<{habilitado:boolean;hash:string|null;salt:string|null;lock_minutos:number}|null>(null);
  useEffect(()=>{void database.obtenerSeguridadPin().then(setSeguridad).catch(e=>setError(e instanceof Error?e.message:String(e)));},[]);
  useEffect(()=>{const id=window.setInterval(()=>{if(bloqueadoHasta&&Date.now()>=bloqueadoHasta)setBloqueadoHasta(0);},250);return()=>window.clearInterval(id);},[bloqueadoHasta]);
  async function desbloquear(){
    if(bloqueadoHasta>Date.now()) return;
    if(pin.length!==6){setError('Escribe 6 dígitos.');return;}
    if(seguridad?.hash && seguridad.salt && await verificarHashPin(pin,seguridad.hash,seguridad.salt)){
      sessionStorage.removeItem('camello.pin.fallos'); setError(null); onDesbloqueado(); return;
    }
    const fallos=Number(sessionStorage.getItem('camello.pin.fallos')??'0')+1; sessionStorage.setItem('camello.pin.fallos',String(fallos));
    const espera=Math.min(30000,1000*fallos*fallos); setBloqueadoHasta(Date.now()+espera); setPin('');
    setError('PIN incorrecto. Espera '+Math.ceil(espera/1000)+' s.');
  }
  if(!seguridad?.habilitado || !seguridad.hash || !seguridad.salt) return null;
  return <div className="pantalla-carga pantalla-pin" role="dialog" aria-modal="true"><div className="tarjeta">
    <p className="texto-kicker">Privacidad</p><h1>Desbloquear CAMELLO</h1>
    <p>El PIN se guarda como hash PBKDF2 con sal. Los fallos no borran datos.</p>
    <input autoFocus inputMode="numeric" type="password" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} onKeyDown={e=>{if(e.key==='Enter')void desbloquear();}} />
    {error&&<p className="texto-error">{error}</p>}
    <button className="boton-primario boton-grande" onClick={()=>void desbloquear()} disabled={bloqueadoHasta>Date.now()}>Desbloquear</button>
  </div></div>;
}