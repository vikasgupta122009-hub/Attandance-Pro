import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:attendance_pro_app/utils/db.dart';
import 'package:attendance_pro_app/screens/admin_dashboard.dart';
import 'package:attendance_pro_app/screens/worker_dashboard.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;

  Future<void> _login() async {
    setState(() => _isLoading = true);
    try {
      final credential = await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
      );
      
      final userDoc = await DB.instance
          .collection('users')
          .doc(credential.user!.uid)
          .get();
      
      if (mounted) {
        final role = userDoc.data()?['role'] ?? 'worker';
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => role == 'admin' 
              ? const AdminDashboard() 
              : const WorkerDashboard(),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Login Failed: ${e.toString()}')),
        );
      }
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'ATTENDLY PRO',
              style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 48),
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'EMAIL ADDRESS', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'SECURE KEY', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _isLoading ? null : _login,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 20),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _isLoading ? const CircularProgressIndicator(color: Colors.white) : const Text('ACCESS TERMINAL'),
            ),
          ],
        ),
      ),
    );
  }
}
