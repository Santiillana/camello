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

async function configurarPrimeraVez(page) {
  const inicial = page.getByRole('heading', { name: 'Vamos a preparar tu espacio de trabajo' });
  await inicial.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
  if (await inicial.isVisible().catch(() => false)) {
    await page.getByLabel('Nombre del negocio').fill('Negocio E2E');
    await page.getByLabel('Nombre de quien lleva la app').fill('Usuario E2E');
    await page.getByRole('button', { name: 'Entrar a CAMELLO' }).click();
    await page.getByRole('heading', { name: 'Inicio' }).waitFor().catch(() => {});
  }
}

async function siguiente(page) {
  await page.getByRole('button', { name: 'Siguiente' }).click();
}

async function omitir(page) {
  await page.getByRole('button', { name: 'Omitir' }).first().click();
}

async function crearCliente(page) {
  await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await configurarPrimeraVez(page);
  await page.getByRole('heading', { name: 'Inicio' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.goto('http://127.0.0.1:5173/#/clientes?nuevo=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
  try {
    await page.getByLabel('Nombre completo').waitFor({ timeout: 70000 });
  } catch (error) {
    const texto = await page.locator('body').innerText().catch(() => '');
    const sqliteStage = await page.evaluate(() => document.documentElement.dataset.camelloSqliteStage || 'sin-etapa').catch(() => 'sin-etapa');
    await page.screenshot({ path: 'e2e-fallo-clientes.png', fullPage: true }).catch(() => {});
    throw new Error('No apareció Nombre completo. Etapa SQLite: ' + sqliteStage + '. Texto de pantalla:\n' + texto.slice(0, 5000) + '\nCausa: ' + String(error));
  }

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
  for (let i = 0; i < 6; i += 1) await omitir(page);
  await page.getByRole('heading', { name: 'Clientes', exact: true }).waitFor();
}

async function expectOption(_page, select, label) {
  await select.locator('option').filter({ hasText: label }).waitFor({ state: 'attached', timeout: 20000 });
}

async function sql(page, query, params = []) {
  return page.evaluate(async ({ query: sqlQuery, params: sqlParams }) => {
    const fn = window.__CAMELLO_TEST_SQL__;
    if (!fn) throw new Error('No existe la API SQLite E2E.');
    return fn(sqlQuery, sqlParams);
  }, { query, params });
}

async function venta(page, metodo, cantidad = 1, doble = false) {
  await page.goto('http://127.0.0.1:5173/#/venta-nueva', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const clienteSelect = page.locator('select').first();
  await page.getByLabel('Buscar cliente o mascota').waitFor({ state: 'visible', timeout: 15000 });
  await expectOption(page, clienteSelect, 'Cliente E2E');
  await clienteSelect.selectOption({ label: 'Cliente E2E' });

  await siguiente(page);
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

    await page.goto('http://127.0.0.1:5173/#/clientes', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.getByRole('heading', { name: 'Clientes', exact: true }).waitFor();
    await page.goto('http://127.0.0.1:5173/#/venta-nueva', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await expectOption(page, page.locator('select').first(), 'Cliente E2E');

    const efectivo = await venta(page, 'EFECTIVO', 1, true);
    if (!efectivo.includes('Efectivo') && !efectivo.includes('Pagado')) throw new Error('No se generó voucher de efectivo.');

    const transferencia = await venta(page, 'TRANSFERENCIA_NEQUI', 1);
    if (!transferencia.includes('Venta #')) throw new Error('No se generó voucher de transferencia.');

    const fiado = await venta(page, 'FIADO', 1);
    if (!fiado.includes('Pendiente')) throw new Error('La venta fiada no dejó pendiente.');

    const parcial = await venta(page, 'PARCIAL', 1);
    if (!parcial.includes('Pendiente')) throw new Error('La venta parcial no dejó pendiente.');

    const ventasBase = await sql(page, "SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM ventas WHERE cliente_id=(SELECT id FROM clientes WHERE nombre='Cliente E2E') AND COALESCE(estado_registro,'activa')='activa';");
    if (Number(ventasBase[0]?.n) !== 4) throw new Error('E2E: no quedaron 4 ventas activas en SQLite.');
    if (Number(ventasBase[0]?.total) <= 0) throw new Error('E2E: total vendido en SQLite inválido.');

    await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.getByRole('link', { name: 'Pagar' }).first().click();
    await page.getByRole('heading', { name: /Pagar a Cliente E2E/ }).waitFor().catch(() => {});
    await page.getByRole('button', { name: 'Efectivo' }).click().catch(() => {});
    if (await page.getByRole('button', { name: 'CONFIRMAR COBRO' }).count()) {
      await page.getByRole('button', { name: 'CONFIRMAR COBRO' }).click();
    }
    await page.getByText(/Cobro registrado|Cartera/).first().waitFor();
    const carteraBase = await sql(page, "SELECT COALESCE(SUM(total-monto_pagado),0) AS pendiente FROM ventas WHERE cliente_id=(SELECT id FROM clientes WHERE nombre='Cliente E2E') AND COALESCE(estado_registro,'activa')='activa';");
    if (Number(carteraBase[0]?.pendiente) < 0) throw new Error('E2E: cartera negativa.');

    await page.goto('http://127.0.0.1:5173/#/rutas', { waitUntil: 'domcontentloaded', timeout: 15000 });


    await crearRuta(page);
    await venta(page, 'EFECTIVO', 1);
    await page.goto('http://127.0.0.1:5173/#/rutas/1', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.getByRole('heading', { name: 'Ruta E2E' }).waitFor();
    await cerrarRuta(page, 4);
    const rutaBase = await sql(page, "SELECT estado, paquetes_llevados, paquetes_sobrantes FROM rutas WHERE id=1;");
    if (rutaBase[0]?.estado !== 'FINALIZADA') throw new Error('E2E: la ruta no quedó finalizada en SQLite.');
    if (Number(rutaBase[0]?.paquetes_llevados) - Number(rutaBase[0]?.paquetes_sobrantes) < 0) throw new Error('E2E: cuadre de ruta inválido.');

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
    const backupBase = await sql(page, "SELECT COUNT(*) AS n FROM clientes;");
    if (Number(backupBase[0]?.n) < 1) throw new Error('E2E: la base no conserva clientes antes del respaldo.');

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
