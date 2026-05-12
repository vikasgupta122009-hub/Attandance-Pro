package com.attendancepro.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.JavascriptInterface;
import android.webkit.WebStorage;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();

        // 1. Core performance optimizations
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        
        // 2. Memory & Cache Optimizations for 1000+ records
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAppCacheEnabled(true); // deprecated but still works on some older devices
        settings.setAllowFileAccess(true);
        
        // 3. Hardware acceleration is typically on by default in BridgeActivity, 
        // but we ensure the layer type is hardware for smooth scrolling
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);

        // 4. Add the Javascript Interface for Multi-Role Switching / Cache clearing
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void clearSystemCache() {
                MainActivity.this.runOnUiThread(() -> {
                    // Clear WebStorage (localStorage, etc.)
                    WebStorage.getInstance().deleteAllData();

                    // Clear Cookies
                    CookieManager.getInstance().removeAllCookies(null);
                    CookieManager.getInstance().flush();

                    // Clear WebView Cache
                    webView.clearCache(true);
                });
            }
        }, "AndroidInterface");
    }
}
