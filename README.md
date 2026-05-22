# Attendly Pro - Pure Flutter Native Mobile Architecture

This project has been consolidated into a **Native Mobile Architecture** built exclusively with **Flutter**. All previous web-centric files have been removed to focus on a high-performance cross-platform mobile solution.

## Project Structure

1. **Native Mobile App (`/attendance_pro_app`)**:
   - The primary codebase for the application.
   - Built with Flutter 3.x for Android and iOS.
   - Uses Firebase for Auth and Firestore.
   - **How to open**: Open the `/attendance_pro_app` folder in **Android Studio** or **VS Code** (with Flutter extension).

2. **Backend Services & Configurations**:
   - `firestore.rules`: Secure database access logic.
   - `firebase-blueprint.json`: Data schema definitions.
   - `server.js`: Operational placeholder for environment compatibility.

## Core Mobile Components

- **Admin Dashboard (`lib/screens/admin_dashboard.dart`)**:
  - Live real-time synced footer with Firebase Streams.
  - PDF Audit generation using native `pdf` and `printing` modules.
  - Member management with administrative authority transfer logic.
  - Operational history calendars.

- **Worker Dashboard (`lib/screens/worker_dashboard.dart`)**:
  - Precision GPS verification for presence marking.
  - Personal log calendar.
  - Cloud sync engine for real-time updates.

- **Utilities (`lib/utils/`)**:
  - Deep-linking into external mapping applications (Google Maps) for worker tracking.

## Setup Instructions

### Firebase Configuration
1. Ensure Firebase Firestore and Auth are enabled.
2. Add your `firebase-applet-config.json` via the AI Studio Settings menu.
3. Deploy the `firestore.rules` via the deploy tool.

### Running the App
1. Navigate to `cd attendance_pro_app`
2. Run `flutter pub get`
3. Run `flutter run` (Connect an emulator or physical device)
