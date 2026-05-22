import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';

class DB {
  /// Custom Firestore DB connected to the correct database instance for this project.
  static FirebaseFirestore get instance {
    return FirebaseFirestore.instanceFor(
      app: Firebase.app(),
      databaseId: "ai-studio-b4e940d7-60ea-45e8-9c00-5c5c38c89432",
    );
  }
}
