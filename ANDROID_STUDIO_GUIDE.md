# Android Studio Project Guide: Attendance Pro

Your application is now fully prepared as a native Android project. You can open, build, and deploy it using Android Studio.

## 1. How to Open in Android Studio

1.  **Download the Project:** Export the project as a ZIP or clone it to your local machine.
2.  **Open Android Studio:** Select **"Open an Existing Project"**.
3.  **Select the Folder:** Navigate to the project root and select the **`android/`** folder.
4.  **Wait for Gradle:** Android Studio will automatically start syncing Gradle. This may take a few minutes as it downloads dependencies (SDK 36, Firebase, etc.).

## 2. Project Structure
*   **`android/app/src/main/java/com/attendancepro/app/MainActivity.java`**: The main entry point. We have added performance optimizations and custom caching logic here for large datasets.
*   **`android/app/src/main/assets/public/`**: This contains your frontend code (React). It is automatically updated when you run `npx cap sync`.
*   **`android/app/build.gradle`**: Contains the application ID, version codes, and Firebase native dependencies.

## 3. Building the App

*   **To Run on Emulator/Device:** Click the **"Run"** (green play) button in Android Studio.
*   **To Build APK:** Go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
*   **To Build Signed Release:** Go to **Build > Generate Signed Bundle / APK**.

## 4. Securing your API Keys (Production)

As mentioned in the `SECURITY_GUIDE.md`:
1.  **Firebase API Key:** While the key is in `firebase-applet-config.json`, you should restrict it to your `com.attendancepro.app` package name in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2.  **SHA-1 Fingerprint:** For Firebase features like Google Sign-In or App Check inside the native app, you must add your SHA-1 fingerprint to your Firebase Project settings.
    *   In Android Studio, open the **Gradle** tab on the right.
    *   Navigate to **app > tasks > android > signingReport**.
    *   Copy the SHA-1 from the console output and add it to your Firebase Project.

## 5. Maintenance Commands

If you make changes to the React code in AI Studio, always run:
```bash
npm run build      # Rebuild the web app
npx cap sync       # Sync changes to the Android project
```
