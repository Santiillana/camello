package co.combopitt.camello;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import co.combopitt.camello.CamelloStoragePlugin;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CamelloStoragePlugin.class);
        super.onCreate(savedInstanceState);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
            WebView.setWebContentsDebuggingEnabled(false);
        }
        emitirCompartidoCuandoEsteListo(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        emitirCompartidoCuandoEsteListo(intent);
    }

    private void emitirCompartidoCuandoEsteListo(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        final String texto = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (texto == null || texto.trim().isEmpty()) return;

        if (getBridge() == null || getBridge().getWebView() == null) return;

        try {
            final String data = new JSONObject()
                .put("text", texto)
                .toString();

            getBridge().getWebView().postDelayed(
                () -> getBridge().triggerJSEvent("camelloShare", "window", data),
                300
            );
        } catch (Exception ignored) {
            // Un dato compartido inválido nunca debe impedir abrir CAMELLO.
        }
    }
}
