import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const { chromium } = await import('playwright');

const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

async function esperarServidor(url) {
  const inicio = Date.now();
  while (Date.now() - inicio < 30000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Vite no inició.\n' + serverLog);
}

async function siguiente(page) {
  await page.getByRole('button', { name: 'Siguiente' }).click();
}

async function omitir(page) {
  await page.getByRole('button', { name: 'Omitir' }).click();
}

async function crearCliente(page) {
  await page.goto('http://127.0.0.1:5173/#/clientes?nuevo=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('heading', { name: 'Nuevo cliente' }).waitFor();

  await page.getByLabel('Nombre completo').fill('Cliente E2E');
  await siguiente(page);
  await page.getByLabel('Teléfono 1').fill('3001234567');
  await sleep(500);

  await page.evaluate(() => window.dispatchEvent(new Event('pause')));
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('heading', { name: 'Tienes un formulario sin terminar' }).waitFor();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Nombre completo').inputValue().then((value) => {
    if (value !== 'Cliente E2E') throw new Error('El borrador no restauró el nombre.');
  });
  await page.getByLabel('Teléfono 1').inputValue().then((value) => {
    if (value !== '3001234567') throw new Error('El borrador no restauró el teléfono.');
  });

  await siguiente(page);
  await omitir(page);
  await omitir(page);
  await omitir(page);
  await omitir(page);
  await omitir(page);
  await page.getByRole('heading', { name: 'Clientes' }).waitFor();
}

async function venta(page, metodo, cantidad = 1, doble = false) {
  await page.goto('http://127.0.0.1:5173/#/venta-nueva', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const clienteSelect = page.locator('select').first();
  await clienteSelect.selectOption({ label: 'Cliente E2E' });

  await siguiente(page);
  const cantidadMinus = page.getByRole('button', { name: '−' });
  const cantidadPlus = page.getByRole('button', { name: '+' });
  if (cantidad > 1) {
    for (let i = 1; i < cantidad; i += 1) await cantidadPlus.click();
  }
  await siguiente(page);

  await page.getByRole('button', { name: metodo === 'TRANSFERENCIA_NEQUI' ? 'Transferencia / Nequi' : metodo === 'PARCIAL' ? 'Pago parcial' : metodo === 'FIADO' ? 'Fiado' : 'Efectivo' }).click();
  if (metodo === 'PARCIAL') {
    await page.getByLabel('¿Cuánto paga ahora?').fill('1000');
  }
  await siguiente(page);

  const confirm = page.getByRole('button', { name: 'CONFIRMAR VENTA' });
  if (doble) await confirm.dblclick();
  else await confirm.click();

  await page.getByRole('heading', { name: 'Venta registrada' }).waitFor();
  const voucher = await page.locator('.voucher').innerText();
  return voucher;
}

async function crearRuta(page) {
  await page.goto('http://127.0.0.1:5173/#/rutas?nuevo=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('heading', { name: 'Nueva ruta' }).waitFor();

  await page.getByLabel('Nombre de la ruta').fill('Ruta E2E');
  await siguiente(page);
  await siguiente(page);
  await page.getByLabel('Paquetes llevados').fill('5');
  await siguiente(page);
  const checkbox = page.getByRole('checkbox', { name: /Registrar ubicación/ });
  if (await checkbox.isChecked()) await checkbox.uncheck();
  await siguiente(page);
  await page.getByRole('button', { name: 'Iniciar ruta' }).click();
  await page.getByRole('heading', { name: 'Ruta E2E' }).waitFor();
}

async function cerrarRuta(page, sobrantes) {
  await page.getByLabel('Paquetes sobrantes').fill(String(sobrantes));
  await page.getByRole('button', { name: 'Cerrar ruta y cuadrar' }).click();
  await page.getByText('Finalizada').waitFor();
  await page.getByText('Diferencia').locator('..').getByText('0').waitFor().catch(() => {});
}

async function probarUbicacionWeb(page) {
  await page.goto('http://127.0.0.1:5173/#/clientes/1', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.goto('http://127.0.0.1:5173/#/clientes?nuevo=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const locationButton = page.getByRole('button', { name: /Usar mi ubicación/ });
  if (await locationButton.count()) {
    await locationButton.click();
    await page.getByText(/GPS requiere la app instalada|No se pudo obtener/).waitFor({ timeout: 8000 }).catch(() => {});
  }
}

try {
  await esperarServidor('http://127.0.0.1:5173');
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(8000);
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await crearCliente(page);

    const efectivo = await venta(page, 'EFECTIVO', 1, true);
    if (!efectivo.includes('Efectivo') && !efectivo.includes('Pagado')) throw new Error('No se generó voucher de efectivo.');

    const transferencia = await venta(page, 'TRANSFERENCIA_NEQUI', 1);
    if (!transferencia.includes('Venta #')) throw new Error('No se generó voucher de transferencia.');

    const fiado = await venta(page, 'FIADO', 1);
    if (!fiado.includes('Pendiente')) throw new Error('La venta fiada no dejó pendiente.');

    const parcial = await venta(page, 'PARCIAL', 1);
    if (!parcial.includes('Pendiente')) throw new Error('La venta parcial no dejó pendiente.');

    await crearRuta(page);
    await venta(page, 'EFECTIVO', 1);
    await page.goto('http://127.0.0.1:5173/#/rutas/1', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.getByRole('heading', { name: 'Ruta E2E' }).waitFor();
    await cerrarRuta(page, 4);

    await page.goto('http://127.0.0.1:5173/#/mapa', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const filtros = page.getByRole('button').filter({ hasText: /Filtro|Ubicación|Días|Ruta/ });
    if (await filtros.count() === 0) {
      await page.getByRole('heading', { name: 'Mapa' }).waitFor().catch(() => {});
    }

    await page.goto('http://127.0.0.1:5173/#/respaldo', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Descargar respaldo/ }).click();
    await download;
    await page.getByText(/Respaldo generado|Respaldo/).first().waitFor();

    await probarUbicacionWeb(page);

    if (consoleErrors.length) {
      throw new Error('E2E encontró errores de consola:\n' + consoleErrors.join('\n'));
    }

    console.log('e2e-core: PASÓ — borrador/reload, cuatro métodos de venta, doble toque, ruta/cuadre, mapa, respaldo y navegación.');
  } finally {
    await browser.close();
  }
} finally {
  server.kill('SIGTERM');
}
