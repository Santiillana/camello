package co.combopitt.camello;

import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedWriter;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "CamelloStorage")
public class CamelloStoragePlugin extends Plugin {
    private static final int REQUEST_DIRECTORY = 4201;

    @Override
    public void load() {
        super.load();
    }

    @PluginMethod
    public void saveBackup(PluginCall call) {
        final String filename = call.getString("filename");
        final String data = call.getString("data");

        if (filename == null || filename.trim().isEmpty()) {
            call.reject("Nombre de archivo inválido.");
            return;
        }
        if (data == null) {
            call.reject("Contenido de respaldo vacío.");
            return;
        }

        final Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        pendingCall = call;
        pendingFilename = filename.trim();
        pendingData = data;
        startActivityForResult(call, intent, "directoryPickerResult");
    }

    private PluginCall pendingCall;
    private String pendingFilename;
    private String pendingData;

    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    public void clearPending(PluginCall call) {
        pendingCall = null;
        pendingFilename = null;
        pendingData = null;
        call.resolve();
    }

    @ActivityCallback
    private void directoryPickerResult(PluginCall call, ActivityResult result) {
        final int resultCode = result.getResultCode();
        final Intent data = result.getData();
        if (pendingCall == null) return;
        final PluginCall target = pendingCall;
        final String filename = pendingFilename;
        final String contents = pendingData;
        pendingCall = null;
        pendingFilename = null;
        pendingData = null;

        if (resultCode != android.app.Activity.RESULT_OK || data == null || data.getData() == null) {
            target.reject("Selección de carpeta cancelada.");
            return;
        }

        final Uri treeUri = data.getData();
        final int takeFlags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            if ((data.getFlags() & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0 && takeFlags != 0) {
                getContext().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);
            }

            final Uri fileUri = DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                DocumentsContract.getTreeDocumentId(treeUri)
            );
            final Uri created = DocumentsContract.createDocument(
                getContext().getContentResolver(),
                fileUri,
                "application/json",
                filename
            );
            if (created == null) {
                target.reject("Android no pudo crear el archivo de respaldo en la carpeta elegida.");
                return;
            }

            try (OutputStream output = getContext().getContentResolver().openOutputStream(created);
                 BufferedWriter writer = output == null ? null : new BufferedWriter(new OutputStreamWriter(output, StandardCharsets.UTF_8))) {
                if (writer == null) throw new IllegalStateException("No se pudo abrir el archivo para escritura.");
                writer.write(contents);
            }

            final JSObject result = new JSObject();
            result.put("uri", created.toString());
            result.put("filename", filename);
            target.resolve(result);
        } catch (Exception error) {
            target.reject("No se pudo guardar el respaldo en la carpeta elegida.", error);
        }
    }
}
