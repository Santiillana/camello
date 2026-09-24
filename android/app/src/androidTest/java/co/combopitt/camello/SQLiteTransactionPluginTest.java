package co.combopitt.camello;

import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Intent;
import android.webkit.WebView;

import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.BridgeActivity;

import org.junit.Test;

import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class SQLiteTransactionPluginTest {

    @Test
    public void pluginReal_rechazaTransaccionAnidada_yAceptaExecuteSinTransaccion() throws Exception {
        Intent intent = new Intent(
            InstrumentationRegistry.getInstrumentation().getTargetContext(),
            MainActivity.class
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        Activity activity = InstrumentationRegistry
            .getInstrumentation()
            .startActivitySync(intent);

        try {
            WebView webView = obtenerWebView(activity);
            String resultado = ejecutarJavascript(webView, """
                (async () => {
                  const plugin = window.Capacitor?.Plugins?.CapacitorSQLite;
                  if (!plugin) throw new Error('CapacitorSQLite no está expuesto en el WebView');

                  const database = 'camello_txn_probe';
                  try {
                    await plugin.deleteDatabase({ database });
                  } catch (_) {}

                  await plugin.createConnection({
                    database,
                    encrypted: false,
                    mode: 'no-encryption',
                    version: 1,
                    readonly: false
                  });
                  await plugin.open({ database, readonly: false });
                  await plugin.execute({
                    database,
                    statements: 'CREATE TABLE IF NOT EXISTS prueba (id INTEGER PRIMARY KEY, valor TEXT);',
                    transaction: false,
                    readonly: false
                  });

                  await plugin.beginTransaction({ database, readonly: false });
                  let nestedFailed = false;
                  try {
                    await plugin.execute({
                      database,
                      statements: 'PRAGMA foreign_keys = OFF;',
                      transaction: true,
                      readonly: false
                    });
                  } catch (error) {
                    nestedFailed = /transaction/i.test(String(error?.message ?? error));
                  }
                  await plugin.rollbackTransaction({ database, readonly: false });

                  await plugin.beginTransaction({ database, readonly: false });
                  await plugin.execute({
                    database,
                    statements: 'PRAGMA foreign_keys = OFF;',
                    transaction: false,
                    readonly: false
                  });
                  await plugin.rollbackTransaction({ database, readonly: false });

                  await plugin.closeConnection({ database, readonly: false });
                  await plugin.deleteDatabase({ database });

                  return JSON.stringify({
                    nestedFailed,
                    transactionFalsePassed: true
                  });
                })()
            """);

            assertTrue(
                "La prueba no reprodujo la transacción anidada del plugin real: " + resultado,
                resultado.contains("\"nestedFailed\":true")
            );
            assertTrue(
                "El execute con transaction:false no terminó correctamente: " + resultado,
                resultado.contains("\"transactionFalsePassed\":true")
            );
        } finally {
            try {
                activity.finishAndRemoveTask();
            } catch (Exception ignored) {
                // La actividad de prueba puede haber terminado durante la carga.
            }
        }
    }

    private static WebView obtenerWebView(Activity activity) throws Exception {
        if (!(activity instanceof BridgeActivity)) {
            throw new AssertionError("La actividad no es BridgeActivity.");
        }

        Method getBridge = activity.getClass().getMethod("getBridge");
        Object bridge = getBridge.invoke(activity);
        Method getWebView = bridge.getClass().getMethod("getWebView");
        return (WebView) getWebView.invoke(bridge);
    }

    private static String ejecutarJavascript(WebView webView, String javascript) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> resultado = new AtomicReference<>();
        AtomicReference<Throwable> error = new AtomicReference<>();

        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            webView.evaluateJavascript(
                "(async()=>{for(let i=0;i<100;i++){if(window.Capacitor?.Plugins?.CapacitorSQLite){return " +
                javascript +
                ";} await new Promise(r=>setTimeout(r,100));} throw new Error('Timeout esperando CapacitorSQLite');})()",
                value -> {
                    resultado.set(value == null ? "" : value);
                    latch.countDown();
                }
            )
        );

        if (!latch.await(20, TimeUnit.SECONDS)) {
            throw new AssertionError("Timeout esperando resultado de JavaScript.");
        }
        if (error.get() != null) throw new AssertionError(error.get());

        return resultado.get();
    }
}
