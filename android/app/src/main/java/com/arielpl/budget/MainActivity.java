package com.arielpl.budget;

import android.app.AlertDialog;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JsResult;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Hide the budget from the app switcher: Android 13+ shows the app's
        // icon there instead of a picture of the last screen. Screenshots still
        // work — FLAG_SECURE would block them too, and that is not wanted.
        // Before Android 13 there is no way to do one without the other, so
        // older phones keep the picture.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setRecentsScreenshotEnabled(false);
        }
        // confirm() and alert() in the phone's own language: Capacitor spells
        // its buttons "OK" and "Cancel" whatever the language (store
        // screenshots, 2026-10-05). Everything else stays Capacitor's.
        Bridge bridge = getBridge();
        if (bridge != null) bridge.getWebView().setWebChromeClient(new LocalizedChromeClient(bridge));
    }

    private static class LocalizedChromeClient extends BridgeWebChromeClient {
        private final Bridge bridge;

        LocalizedChromeClient(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
            if (bridge.getActivity().isFinishing()) return true;
            new AlertDialog.Builder(view.getContext())
                .setMessage(message)
                .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                .setOnCancelListener(dialog -> result.cancel())
                .show();
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
            if (bridge.getActivity().isFinishing()) return true;
            new AlertDialog.Builder(view.getContext())
                .setMessage(message)
                .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                .setOnCancelListener(dialog -> result.cancel())
                .show();
            return true;
        }
    }
}
