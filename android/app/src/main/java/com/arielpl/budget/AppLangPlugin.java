package com.arielpl.budget;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The page tells the native side which language the app is in, so confirm()
 * and alert() can put their buttons in it: the app can be Spanish on a Swedish
 * phone (store screenshots, 2026-10-05). Until it has said, Android's own
 * words are used — the phone's language.
 */
@CapacitorPlugin(name = "AppLang")
public class AppLangPlugin extends Plugin {
    private static volatile String lang;

    @PluginMethod
    public void set(PluginCall call) {
        lang = call.getString("lang");
        call.resolve();
    }

    static String cancel(Context context) {
        if ("sv".equals(lang)) return "Avbryt";
        if ("en".equals(lang)) return "Cancel";
        if ("es".equals(lang)) return "Cancelar";
        return context.getString(android.R.string.cancel);
    }

    static String ok(Context context) {
        if ("es".equals(lang)) return "Aceptar";
        if ("sv".equals(lang) || "en".equals(lang)) return "OK";
        return context.getString(android.R.string.ok);
    }
}
