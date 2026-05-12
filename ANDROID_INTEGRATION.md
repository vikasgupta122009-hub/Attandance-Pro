# Android Multi-Directory Workspace Switcher Integration

This document provides the necessary Android (Java/Kotlin) code and instructions to integrate the multi-role switcher feature into your Android Studio project.

## 1. JavaScript Bridge (Client Side)

The following logic is already integrated into the React app's `AuthContext.tsx`. It clears all local state and triggers a reload.

```javascript
const switchWorkspace = async (companyCode, role) => {
  // 1. Update active workspace in Firestore
  await updateActiveWorkspace(companyCode, role);

  // 2. Clear Local Storage & Sessions
  window.localStorage.clear();
  window.sessionStorage.clear();
  
  // 3. Clear Cookies
  document.cookie.split(";").forEach((c) => {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
  });

  // 4. Trigger Native Android Cache Clear (via JavascriptInterface)
  if (window.AndroidInterface) {
    window.AndroidInterface.clearSystemCache();
  }

  // 5. Hard Reload
  window.location.href = "/";
};
```

## 2. Android (Java) JavascriptInterface

Add this class to your Android project to allow the WebView to communicate with the Android system.

```java
import android.content.Context;
import android.webkit.JavascriptInterface;
import android.webkit.WebStorage;
import android.webkit.CookieManager;

public class WebAppInterface {
    Context mContext;

    WebAppInterface(Context c) {
        mContext = c;
    }

    /**
     * Clears WebView cache, cookies, and storage.
     * Call this from JavaScript when switching roles.
     */
    @JavascriptInterface
    public void clearSystemCache() {
        // Clear WebStorage (localStorage, etc.)
        WebStorage.getInstance().deleteAllData();

        // Clear Cookies
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();

        // Clear WebView Cache
        // Note: This must be run on the UI thread
        if (mContext instanceof Activity) {
            ((Activity) mContext).runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    webView.clearCache(true);
                }
            });
        }
    }
}
```

### Integration in Android Studio:
In your `MainActivity.java` (or wherever you initialize the `WebView`):

```java
WebView myWebView = (WebView) findViewById(R.id.webview);
myWebView.getSettings().setJavaScriptEnabled(true);
myWebView.getSettings().setDomStorageEnabled(true);

// Add the interface
myWebView.addJavascriptInterface(new WebAppInterface(this), "AndroidInterface");

myWebView.loadUrl("https://your-app-url.run.app");
```

## 3. Firestore Data Schema (Multi-Role)

To support a user being an Admin in Company A and a Worker in Company B, the following structure is used:

### Users Collection (`/users/{userId}`)
```json
{
  "uid": "USER123",
  "name": "Jane Doe",
  "activeCompanyCode": "COMPANY_A",
  "activeRole": "admin"
}
```

### Memberships Subcollection (`/users/{userId}/memberships/{companyCode}`)
```json
{
  "companyCode": "COMPANY_A",
  "companyName": "Jane's Bakery",
  "role": "admin",
  "joinedAt": 1625097600000
}
```

```json
{
  "companyCode": "COMPANY_B",
  "companyName": "Tech Corp",
  "role": "worker",
  "joinedAt": 1625098000000
}
```

## 4. Admin Succession Logic

The "Admin Succession Rule" is enforced in the `WorkspaceSwitcher.tsx` component.
If a user is the primary admin of a company, they cannot leave until they:
1. Promote another member to Admin.
2. OR Choose to delete the entire company (permitted only if they are the last member).

### Promotion Logic Implementation:
```javascript
const promoteAndLeave = async (newAdminId, companyCode) => {
  const batch = firestore.batch();
  
  // 1. Promote new admin
  batch.update(doc(firestore, 'companies', companyCode), { adminId: newAdminId });
  batch.update(doc(firestore, 'users', newAdminId, 'memberships', companyCode), { role: 'admin' });
  
  // 2. Remove current user's membership
  batch.delete(doc(firestore, 'users', currentUserId, 'memberships', companyCode));
  
  await batch.commit();
};
```
