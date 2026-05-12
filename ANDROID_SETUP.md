# Android Setup for Attendance Pro

To ensure the WebView functions correctly with hardware features (Camera, GPS, Bridge), follow these steps in your Android Studio project.

## 1. AndroidManifest.xml
Add these permissions inside the `<manifest>` tag but outside `<application>`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<!-- Required for WebView to use camera on some devices -->
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
```

## 2. MainActivity.java (or .kt)
You must implement a `WebChromeClient` to handle the permission requests from the web app.

### Java Implementation:
```java
webView.setWebChromeClient(new WebChromeClient() {
    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        // Automatically grant permissions requested by the web app (Camera/Mic)
        request.grant(request.getResources());
    }

    // For Geolocation
    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        callback.invoke(origin, true, false);
    }
});

// Configure Settings
WebSettings settings = webView.getSettings();
settings.setJavaScriptEnabled(true);
settings.setDomStorageEnabled(true); // Crucial for localStorage
settings.setDatabaseEnabled(true);
settings.setGeolocationEnabled(true);
settings.setMediaPlaybackRequiresUserGesture(false);

// The AndroidBridge
webView.addJavascriptInterface(new Object() {
    @JavascriptInterface
    public void clearSystemCache() {
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.clearCache(true);
                android.webkit.WebStorage.getInstance().deleteAllData();
                android.widget.Toast.makeText(MainActivity.this, "Identity Cache Cleared", Toast.LENGTH_SHORT).show();
            }
        });
    }
}, "AndroidBridge");
```

## 3. Storage Reset Logic
When switching roles, the web app calls `AndroidBridge.clearSystemCache()`. This ensures that even if the WebView is persistent, the persistent storage (cookies/localStorage) is wiped clean before the next profile loads.
