import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:attendance_pro_app/utils/db.dart';

class WorkerDashboard extends StatefulWidget {
  const WorkerDashboard({super.key});

  @override
  State<WorkerDashboard> createState() => _WorkerDashboardState();
}

class _WorkerDashboardState extends State<WorkerDashboard> {
  late final WebViewController _controller;
  bool _isLoadingLocation = false;
  DateTime _focusedDay = DateTime.now();
  String? _groupId;
  String? _fullName;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse('https://attendly-mobile-preview.web.app')); // Placeholder for sync view
    _loadUserInfo();
  }

  Future<void> _loadUserInfo() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      final doc = await DB.instance.collection('users').doc(user.uid).get();
      if (mounted) {
        setState(() {
          _groupId = doc.data()?['groupId'];
          _fullName = doc.data()?['fullName'];
        });
      }
    }
  }

  Future<void> _markPresence() async {
    if (_groupId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Awaiting group assignment...')));
      return;
    }

    setState(() => _isLoadingLocation = true);
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
        Position pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
        
        await DB.instance.collection('attendance').add({
          'userId': user.uid,
          'userName': _fullName ?? 'Worker',
          'groupId': _groupId,
          'timestamp': FieldValue.serverTimestamp(),
          'type': 'in',
          'location': {'lat': pos.latitude, 'lng': pos.longitude},
          'verified': true,
          'method': 'GPS'
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Presence Verified via GPS. Status: ACTIVE.'),
              backgroundColor: Color(0xFF10B981),
            ),
          );
        }
      } else {
        throw 'Location permissions denied. Cannot verify presence.';
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Verification Error: $e'), backgroundColor: Colors.red));
      }
    } finally {
      if (mounted) setState(() => _isLoadingLocation = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('WORKER PORTAL', style: TextStyle(fontWeight: FontWeight.w900, fontStyle: FontStyle.italic)),
        actions: [
          IconButton(icon: const Icon(Icons.logout, color: Colors.black), onPressed: () => FirebaseAuth.instance.signOut()),
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
             Padding(
              padding: const EdgeInsets.all(24.0),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(32),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Colors.black, Color(0xFF222222)]),
                  borderRadius: BorderRadius.circular(40),
                ),
                child: Column(
                  children: [
                    const Text('SECURE OPS LINK: ESTABLISHED', style: TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.w900, fontSize: 10, letterSpacing: 2)),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _isLoadingLocation ? null : _markPresence,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                          elevation: 10,
                          shadowColor: Colors.black.withValues(alpha: 0.5),
                        ),
                        child: _isLoadingLocation 
                          ? const CircularProgressIndicator(color: Colors.black)
                          : const Text('MARK PRESENT (GPS)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14, letterSpacing: 1.5)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Live GPS Coordinate Sync Active',
                      style: TextStyle(color: Colors.grey[600], fontSize: 10, fontWeight: FontWeight.bold),
                    )
                  ],
                ),
              ),
            ),
            _buildTeammateStatus(),
            _buildCalendarSection(),
            const Divider(height: 64, thickness: 1, indent: 40, endIndent: 40),
             const Padding(
              padding: EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              child: Row(
                children: [
                   Icon(Icons.cloud_sync, size: 16, color: Colors.indigo),
                   SizedBox(width: 12),
                  Text('LEGACY DATA SYNC ENGINE', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 10, letterSpacing: 2, color: Colors.grey)),
                ],
              ),
            ),
            Container(
              height: 500,
              margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.grey[200]!),
              ),
              clipBehavior: Clip.antiAlias,
              child: WebViewWidget(controller: _controller),
            ),
            const SizedBox(height: 48),
          ],
        ),
      ),
    );
  }

  Widget _buildTeammateStatus() {
    if (_groupId == null) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 32),
          child: Text('TEAMMATE LOGS (TODAY)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 10, letterSpacing: 2, color: Colors.grey)),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: 100,
          child: StreamBuilder<QuerySnapshot>(
            stream: DB.instance
                .collection('attendance')
                .where('groupId', isEqualTo: _groupId)
                .where('timestamp', isGreaterThan: Timestamp.fromDate(DateTime.now().subtract(const Duration(hours: 12))))
                .orderBy('timestamp', descending: true)
                .snapshots(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
              final logs = snapshot.data!.docs;
              
              if (logs.isEmpty) {
                return const Center(child: Text('No active teammates', style: TextStyle(fontSize: 10, color: Colors.grey)));
              }

              return ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 32),
                itemCount: logs.length,
                itemBuilder: (context, index) {
                  final data = logs[index].data() as Map<String, dynamic>;
                  return Container(
                    width: 70,
                    margin: const EdgeInsets.only(right: 16),
                    child: Column(
                      children: [
                        CircleAvatar(
                          backgroundColor: Colors.grey[100],
                          radius: 25,
                          child: Text(data['userName']?[0] ?? '?', style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          data['userName']?.split(' ')[0] ?? '...',
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                          overflow: TextOverflow.ellipsis,
                        )
                      ],
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildCalendarSection() {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('PERSONAL LOG ANALYTICS', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 10, letterSpacing: 2, color: Colors.grey)),
          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: BorderRadius.circular(24),
            ),
            child: TableCalendar(
              focusedDay: _focusedDay,
              firstDay: DateTime.utc(2023, 1, 1),
              lastDay: DateTime.now(),
              headerStyle: const HeaderStyle(formatButtonVisible: false, titleCentered: true),
              calendarStyle: const CalendarStyle(
                todayDecoration: BoxDecoration(color: Colors.black, shape: BoxShape.circle),
                selectedDecoration: BoxDecoration(color: Colors.indigo, shape: BoxShape.circle),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
