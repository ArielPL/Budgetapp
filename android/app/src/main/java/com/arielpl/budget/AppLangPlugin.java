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

    /** The app's theme, as the page last said ("light" / "dark"). Android
     *  needs no cover of its own (MainActivity hides the app from the switcher
     *  differently), so it is only kept; resolving keeps the shared call quiet. */
    static volatile String themeMode;

    @PluginMethod
    public void theme(PluginCall call) {
        themeMode = call.getString("mode");
        call.resolve();
    }

    static String cancel(Context context) {
        if ("sv".equals(lang)) return "Avbryt";
        if ("en".equals(lang)) return "Cancel";
        if ("es".equals(lang)) return "Cancelar";
        if ("fr".equals(lang)) return "Annuler";
        if ("de".equals(lang)) return "Abbrechen";
        if ("ja".equals(lang)) return "キャンセル";
        if ("zh".equals(lang)) return "取消";
        if ("it".equals(lang)) return "Annulla";
        if ("pt".equals(lang)) return "Cancelar";
        if ("ru".equals(lang)) return "Отмена";
        if ("tr".equals(lang)) return "İptal";
        return context.getString(android.R.string.cancel);
    }

    static String ok(Context context) {
        if ("es".equals(lang)) return "Aceptar";
        if ("zh".equals(lang)) return "确定";
        if ("pt".equals(lang)) return "OK";
        if ("ru".equals(lang)) return "ОК";
        if ("tr".equals(lang)) return "Tamam";
        if ("sv".equals(lang) || "en".equals(lang) || "fr".equals(lang) || "de".equals(lang) || "ja".equals(lang) || "it".equals(lang)) return "OK";
        return context.getString(android.R.string.ok);
    }
}
