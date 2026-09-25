import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const { chromium } = await import('playwright');

const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
});

async function detenerServidor() {
  const pid = server.pid;
  if (pid == null || server.exitCode !== null) return;

  try {
    if (process.platform === 'win32') server.kill('SIGTERM');
    else process.kill(-pid, 'SIGTERM');
  } catch (error) {
    console.warn('UI Smoke: no fue posible detener el grupo del servidor:', error);
  }

  const deadline = Date.now() + 3000;
  while (server.exitCode === null && Date.now() < deadline) await sleep(100);

  if (server.exitCode === null) {
    try {
      if (process.platform === 'win32') server.kill('SIGKILL');
      else process.kill(-pid, 'SIGKILL');
    } catch (error) {
      console.warn('UI Smoke: no fue posible forzar la detención del servidor:', error);
    }
  }
}

let logs = '';
server.stdout.on('data', (chunk) => { logs += chunk.toString(); });
server.stderr.on('data', (chunk) => { logs += chunk.toString(); });

async function esperarServidor(url, timeoutMs = 30000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* Espera auxiliar best-effort; el bucle principal reintenta hasta el límite configurado. */ }
    await sleep(300);
  }
  throw new Error('Vite no inició a tiempo.\n' + logs);
}

try {
  await esperarServidor('http://127.0.0.1:5173');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(7000);
    console.log('ui-c1: abrir app');
    await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log('ui-c1: comprobar Inicio');
    await page.getByRole('heading', { name: '¿Cómo vamos?' }).waitFor({ timeout: 15000 });
    console.log('ui-c1: comprobar menú');

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    console.log('ui-c1: contar secciones');
    const menuLinks = page.locator('.side-nav .side-nav-item');
    if (await menuLinks.count() !== 11) throw new Error('C1/B4: el menú lateral no muestra las 11 secciones principales.');
    if (await page.getByRole('link', { name: 'Vender' }).count() !== 0) throw new Error('C1: todavía existe Vender en la barra inferior.');
    if (await page.getByRole('link', { name: 'Gastos' }).count() !== 1) throw new Error('B4: falta Gastos en el menú lateral.');
    const marca = await page.locator('.side-nav-marca').innerText();
    if (marca !== 'CAMELLO') throw new Error('B4: el nombre CAMELLO no se muestra completo.');
    await page.getByRole('button', { name: 'Cerrar menú' }).first().click();
    console.log('ui-c1: comprobar +');
    const fab = page.getByRole('button', { name: 'Nueva acción' });
    if (await fab.count() !== 1) throw new Error('C1: falta el botón flotante +.');
    await fab.click();
    if (await page.getByRole('menu').getByRole('button', { name: /Nueva venta/ }).count() !== 1) throw new Error('C1: falta Nueva venta en el +.');
    if (await page.getByRole('menu').getByRole('button', { name: /Nueva ruta/ }).count() !== 1) throw new Error('C1: falta Nueva ruta en el +.');

    await page.setViewportSize({ width: 360, height: 800 });
    const contenidoMovil = page.locator('.app-contenido');
    const paddingLeft = await contenidoMovil.evaluate((el) => getComputedStyle(el).paddingLeft);
    if (Number.parseFloat(paddingLeft) < 50) throw new Error('B4: el contenido móvil no reserva espacio para el riel.');

    console.log('ui-c1: comprobar escritorio');
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const nav = page.locator('.side-nav');
    if (await nav.count() !== 1) throw new Error('C1: no existe el riel lateral en escritorio.');
    const contenido = page.locator('.pantalla');
    const ancho = await contenido.evaluate((el) => getComputedStyle(el).maxWidth);
    if (ancho === 'none' || ancho === '100%') throw new Error('C1: el contenido perdió el ancho máximo en escritorio.');

    console.log('ui-c1: PASÓ — 11 secciones, Gastos, sin Vender, + con Nueva venta/Nueva ruta, riel 360px y ancho limitado.');
  } finally {
    await browser.close();
  }
} finally {
  await detenerServidor();
}
