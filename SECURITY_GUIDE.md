# Security Guide: Protecting your Data and API Keys

This app uses Firebase for its backend. While the configuration is public (it has to be for the web app to connect), you must follow these steps to secure your production environment.

## 1. Restrict your Firebase API Key
The API key found in `firebase-applet-config.json` is used by the frontend. To prevent others from using this key on their own websites, you **MUST** restrict it in the Google Cloud Console.

1.  Go to the [Google Cloud Console Credentials page](https://console.cloud.google.com/apis/credentials).
2.  Locate the API Key used by your Firebase project (usually named "Browser key" or similar).
3.  Click **Edit API Key**.
4.  Under **Set an application restriction**, select **Websites**.
5.  Add your production domain (e.g., `https://your-app.web.app`) and any development domains.
6.  Under **API restrictions**, select **Restrict key** and choose the following services:
    *   Identity Toolkit API
    *   Cloud Firestore API
    *   Token Service API
7.  Click **Save**.

## 2. Firestore Security Rules
We have already implemented robust security rules in `firestore.rules`. These rules ensure:
*   Users can only read their own data or data belonging to their company.
*   Admins can only see data for workers who have joined their company.
*   No one can modify someone else's attendance or profile.
*   Mandatory fields are validated on every write.

**To deploy or update rules, run:**
The system automatically deploys `firestore.rules` when they change in this environment. For manual deployment, use the Firebase CLI: `firebase deploy --only firestore:rules`.

## 3. Verify User Identities
In a production setting, you should consider enabling **Email Verification** in Firebase Authentication settings. Our security rules include an `isVerified()` helper that can be used to restrict writes to only those users who have verified their emails.

## 4. Android WebView Security
The `MainActivity.java` has been optimized for performance, but ensure that:
*   `setAllowFileAccess(false)` is used if you don't need local file access in production (we set it to `true` for general compatibility, but it can be restricted).
*   Always load your app over HTTPS.

## 5. Environment Variables
Never commit sensitive server-side secrets (like Service Account keys) to your repository. This app is designed to be serverless, so all identity logic is handled via Firebase Auth and Security Rules.
