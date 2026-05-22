import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'dart:io' show Platform;
import 'package:firebase_core/firebase_core.dart';
import 'package:attendance_pro_app/screens/login_screen.dart';

// Unified Multi-platform Firebase configuration properties
const String firebaseApiKey = "AIzaSyCh-luqBLU664b1xI8Lnuge4KtJSXTO6zA";
const String firebaseProjectId = "gen-lang-client-0263586935";
const String firebaseStorageBucket = "gen-lang-client-0263586935.firebasestorage.app";
const String firebaseSenderId = "37024454272";

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Resolve the appropriate App ID per-platform to prevent native initialization failures
  String appId = "1:37024454272:web:3142962204431986f5f865"; // Default Web Target Option
  
  if (!kIsWeb) {
    if (Platform.isAndroid) {
      appId = "1:37024454272:android:65db1f9457fb1e52cf0012";
    } else if (Platform.isIOS || Platform.isMacOS) {
      appId = "1:37024454272:ios:9e78e1247f12e987c908fd";
    } else if (Platform.isWindows) {
      appId = "1:37024454272:windows:df7198e38a2e128cb8cd21";
    }
  }

  await Firebase.initializeApp(
    options: FirebaseOptions(
      apiKey: firebaseApiKey,
      appId: appId,
      messagingSenderId: firebaseSenderId,
      projectId: firebaseProjectId,
      storageBucket: firebaseStorageBucket,
    ),
  );

  runApp(const AttendlyMobileApp());
}

class AttendlyMobileApp extends StatelessWidget {
  const AttendlyMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Attendly Pro',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.black,
          primary: Colors.black,
        ),
        fontFamily: 'Inter',
      ),
      home: const LoginScreen(),
    );
  }
}
