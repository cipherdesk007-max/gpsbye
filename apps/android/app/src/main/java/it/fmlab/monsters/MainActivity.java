// FMLAB Cristalia — app Android.
// Il gioco gira in una WebView con i file inclusi nell'app (si gioca anche offline).
// I file NON si aprono come file:// ma da https://appassets.androidplatform.net/assets/web/
// tramite WebViewAssetLoader (androidx.webkit, il modo consigliato da Google):
//  - origine https stabile e sicura → localStorage (salvataggi), WebGL e Web Audio senza limiti;
//  - le chiamate fetch al server Google (https://script.google.com/.../exec) sono normali richieste
//    tra origini diverse: Google risponde con Access-Control-Allow-Origin: *, quindi funzionano;
//  - niente accesso ai file del telefono (setAllowFileAccess(false)).
package it.fmlab.monsters;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/web/index.html";
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);   // lo schermo non si spegne mentre giochi
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // salvataggi (localStorage)
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);                      // il gioco non si ingrandisce col testo grande di sistema
        web.setBackgroundColor(0xFF0F1422);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // prova automatica (solo CI): am start … --ez autotest true
        final boolean autotest = getIntent() != null && getIntent().getBooleanExtra("autotest", false);
        if (autotest) {
            WebView.setWebContentsDebuggingEnabled(true);
            web.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage m) {
                    String t = m.message();
                    if (t != null && t.startsWith("AUTOTEST ")) Log.i("CristaliaTest", t);
                    else if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.w("CristaliaTest", "ERRORE " + t + " @" + m.sourceId() + ":" + m.lineNumber());
                    return true;
                }
            });
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                WebViewCompat.addDocumentStartJavaScript(web,
                        "window.__autotestErrors=[];addEventListener('error',function(e){__autotestErrors.push(String(e.message))});addEventListener('unhandledrejection',function(e){__autotestErrors.push('promise: '+String(e.reason))});",
                        Collections.singleton("https://" + HOST));
            }
        }
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (!autotest) return;
                try (InputStream in = getAssets().open("web/autotest.js")) {
                    java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                    byte[] b = new byte[8192];
                    int n;
                    while ((n = in.read(b)) > 0) buf.write(b, 0, n);
                    view.evaluateJavascript(new String(buf.toByteArray(), StandardCharsets.UTF_8), null);
                } catch (Exception e) { Log.w("CristaliaTest", "ERRORE autotest.js: " + e); }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;              // pagine del gioco
                String sc = u.getScheme();
                if ("http".equals(sc) || "https".equals(sc)) {           // link esterni nel browser
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                    return true;
                }
                return false;
            }
        });
        setContentView(web);
        if (state != null) web.restoreState(state);
        if (web.getUrl() == null) web.loadUrl(START);
        hideBars();
    }

    private void hideBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); hideBars(); }
    @Override protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }

    // tasto indietro: se la pagina ha una cronologia torna indietro, altrimenti l'app va in secondo piano
    // (non la chiude: la partita resta dov'era)
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else moveTaskToBack(true);
    }
}
