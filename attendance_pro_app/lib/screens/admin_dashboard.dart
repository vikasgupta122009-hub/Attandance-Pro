import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:attendance_pro_app/utils/db.dart';

class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  DateTime _focusedDay = DateTime.now();
  String? _groupId;
  String? _groupCode;
  String? _groupName;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _initAdminSession();
  }

  Future<void> _initAdminSession() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      final doc = await DB.instance.collection('users').doc(user.uid).get();
      final gid = doc.data()?['groupId'];
      if (gid != null) {
        final gDoc = await DB.instance.collection('groups').doc(gid).get();
        if (mounted) {
          setState(() {
            _groupId = gid;
            _groupCode = gDoc.data()?['groupCode'];
            _groupName = gDoc.data()?['name'];
            _isLoading = false;
          });
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('ADMIN TERMINAL', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: -1, fontStyle: FontStyle.italic)),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings, color: Colors.black),
            onPressed: _showGroupSettings,
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.black),
            onPressed: () => FirebaseAuth.instance.signOut(),
          ),
        ],
      ),
      body: Column(
        children: [
          _buildLiveFeed(),
          _buildStatsHeader(),
          Expanded(child: _buildWorkerList()),
        ],
      ),
    );
  }

  Widget _buildLiveFeed() {
    return StreamBuilder<QuerySnapshot>(
      stream: DB.instance
          .collection('attendance')
          .where('groupId', isEqualTo: _groupId)
          .orderBy('timestamp', descending: true)
          .limit(1)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData || snapshot.data!.docs.isEmpty) return const SizedBox.shrink();
        final lastLog = snapshot.data!.docs.first.data() as Map<String, dynamic>;
        final time = (lastLog['timestamp'] as Timestamp?)?.toDate() ?? DateTime.now();
        final method = lastLog['method'] ?? 'GPS';
        
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
          color: const Color(0xFFECFDF5),
          child: Row(
            children: [
              const Icon(Icons.radar, color: Color(0xFF10B981), size: 14),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'SYNC: ${lastLog['userName'] ?? 'Member'} marked ${lastLog['type'].toString().toUpperCase()} via $method at ${DateFormat('HH:mm:ss').format(time)}',
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF10B981), letterSpacing: 1),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStatsHeader() {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('WORKFORCE NODES', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 10, letterSpacing: 2, color: Colors.grey)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: _generateAndPrintReport,
            icon: const Icon(Icons.picture_as_pdf, size: 14),
            label: const Text('GENERATE AUDIT', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.black, foregroundColor: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildWorkerList() {
    return StreamBuilder<QuerySnapshot>(
      stream: DB.instance
          .collection('users')
          .where('groupId', isEqualTo: _groupId)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final users = snapshot.data!.docs;

        return ListView.builder(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          itemExtent: 90, // Fixed height for 10,000+ performance
          itemCount: users.length,
          itemBuilder: (context, index) {
            final userDoc = users[index];
            final userData = userDoc.data() as Map<String, dynamic>;
            final name = userData['fullName'] ?? 'Unknown Member';
            
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                onTap: () => _showWorkerControls(userDoc.id, userData),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                tileColor: Colors.grey[50],
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                leading: CircleAvatar(
                  backgroundColor: Colors.indigo[100],
                  child: Text(name[0], style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.indigo)),
                ),
                title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
                subtitle: Text(userData['role']?.toString().toUpperCase() ?? 'WORKER', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.grey)),
                trailing: const Icon(Icons.chevron_right, size: 16),
              ),
            );
          },
        );
      },
    );
  }

  void _showWorkerControls(String uid, Map<String, dynamic> userData) {
    String? selectedOverride = 'Present';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => Container(
          height: MediaQuery.of(context).size.height * 0.9,
          decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(40))),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(userData['fullName'] ?? 'Member', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                        const Text('OPERATIONAL HISTORY', style: TextStyle(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
                      ],
                    ),
                    IconButton(
                      onPressed: () => _confirmTerminate(uid, userData),
                      icon: const Icon(Icons.delete_outline, color: Colors.red),
                    )
                  ],
                ),
                const SizedBox(height: 32),
                TableCalendar(
                  focusedDay: _focusedDay,
                  firstDay: DateTime.now().subtract(const Duration(days: 365)),
                  lastDay: DateTime.now(),
                  calendarStyle: const CalendarStyle(todayDecoration: BoxDecoration(color: Colors.black, shape: BoxShape.circle)),
                ),
                const SizedBox(height: 32),
                const Text('ATTENDANCE OVERRIDE', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 10, letterSpacing: 1)),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(color: Colors.grey[100], borderRadius: BorderRadius.circular(16)),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: selectedOverride,
                      isExpanded: true,
                      items: ['Present', 'Absent', 'Late'].map((String value) {
                        return DropdownMenuItem<String>(
                          value: value,
                          child: Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                        );
                      }).toList(),
                      onChanged: (val) {
                        setModalState(() => selectedOverride = val);
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => _manualMark(uid, userData['fullName'], selectedOverride!.toLowerCase()),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.black,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.all(20),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('APPLY OVERRIDE', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Note: Overriding will mark a manual entry for today.',
                  style: TextStyle(fontSize: 10, color: Colors.grey, fontStyle: FontStyle.italic),
                )
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _manualMark(String uid, String? name, String type) async {
    await DB.instance.collection('attendance').add({
      'userId': uid,
      'userName': name ?? 'Member',
      'groupId': _groupId,
      'type': type,
      'timestamp': FieldValue.serverTimestamp(),
      'verified': true,
      'method': 'manual'
    });
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Manual override applied')));
  }

  void _confirmTerminate(String uid, Map<String, dynamic> userData) {
    if (userData['role'] == 'admin') {
      _checkAdminTransfer(uid);
      return;
    }

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('TERMINATE ACCESS?'),
        content: Text('Remove ${userData['fullName']} from this group?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCEL')),
          TextButton(
            onPressed: () async {
              await DB.instance.collection('users').doc(uid).update({'groupId': null});
              Navigator.pop(context);
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Worker removed from group')));
            }, 
            child: const Text('TERMINATE', style: TextStyle(color: Colors.red))
          ),
        ],
      ),
    );
  }

  Future<void> _checkAdminTransfer(String uid) async {
    final adminsDoc = await DB.instance
        .collection('users')
        .where('groupId', isEqualTo: _groupId)
        .where('role', isEqualTo: 'admin')
        .get();
    
    if (adminsDoc.docs.length <= 1) {
      if (mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('TRANSFER REQUIRED'),
            content: const Text('You are the last administrator. Please assign another member as Admin before leaving or deleting this account.'),
            actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('UNDERSTOOD'))],
          ),
        );
      }
    } else {
      // If there are other admins, we can allow the user to leave
       showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('LEAVE GROUP?'),
          content: const Text('Are you sure you want to resign as Admin and leave this group?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCEL')),
            TextButton(
              onPressed: () async {
                await DB.instance.collection('users').doc(uid).update({'groupId': null, 'role': 'worker'});
                Navigator.pop(context);
                Navigator.pop(context);
                FirebaseAuth.instance.signOut();
              }, 
              child: const Text('LEAVE', style: TextStyle(color: Colors.red))
            ),
          ],
        ),
      );
    }
  }

  void _showGroupSettings() {
    showModalBottomSheet(
      context: context,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('GROUP CONFIGURATION', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, letterSpacing: 1)),
            const SizedBox(height: 24),
            ListTile(
              title: const Text('Delete Entire Group', style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
              trailing: const Icon(Icons.warning_amber, color: Colors.red),
              onTap: _confirmDeleteGroup,
            ),
            const SizedBox(height: 8),
            const Text(
              'Deleting the group will unbind all members immediately.',
              style: TextStyle(fontSize: 10, color: Colors.grey),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  void _confirmDeleteGroup() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('CRITICAL ACTION'),
        content: const Text('This will delete the group code and unbind all workers. This action is irreversible.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('ABORT')),
          TextButton(onPressed: () async {
            // Unbind users first
            final users = await DB.instance.collection('users').where('groupId', isEqualTo: _groupId).get();
            for (var doc in users.docs) {
              await doc.reference.update({'groupId': null});
            }
            await DB.instance.collection('groups').doc(_groupId).delete();
            Navigator.pop(context);
            Navigator.pop(context);
            FirebaseAuth.instance.signOut();
          }, child: const Text('DELETE PERMANENTLY', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
  }

  Future<void> _generateAndPrintReport() async {
    final pdf = pw.Document();
    
    final attendanceSnap = await DB.instance
        .collection('attendance')
        .where('groupId', isEqualTo: _groupId)
        .orderBy('timestamp', descending: true)
        .get();

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        build: (pw.Context context) {
          return [
            pw.Header(
              level: 0,
              child: pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text('Attendly Pro: Operational Audit', style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold)),
                  pw.Text(_groupName ?? 'System Report', style: const pw.TextStyle(fontSize: 12, color: PdfColors.grey700)),
                ],
              ),
            ),
            pw.SizedBox(height: 10),
            pw.Text('Audit Generated on: ${DateFormat('yyyy-MM-dd HH:mm').format(DateTime.now())}'),
            pw.Text('Group Identity: $_groupCode'),
            pw.SizedBox(height: 20),
            pw.TableHelper.fromTextArray(
              headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white),
              headerDecoration: const pw.BoxDecoration(color: PdfColors.black),
              cellAlignment: pw.Alignment.centerLeft,
              data: <List<String>>[
                <String>['Log Date', 'Member Name', 'Event Type', 'Method'],
                ...attendanceSnap.docs.map((doc) {
                  final data = doc.data();
                  final time = (data['timestamp'] as Timestamp?)?.toDate() ?? DateTime.now();
                  return [
                    DateFormat('MM/dd HH:mm').format(time),
                    data['userName']?.toString() ?? 'Unknown',
                    data['type']?.toString().toUpperCase() ?? '-',
                    data['method']?.toString() ?? 'GPS'
                  ];
                })
              ],
            ),
            pw.Padding(
              padding: const pw.EdgeInsets.only(top: 20),
              child: pw.Text('End of Report - Secure Verification Token: ${DateTime.now().millisecondsSinceEpoch}', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey500)),
            )
          ];
        },
      ),
    );

    await Printing.layoutPdf(onLayout: (PdfPageFormat format) async => pdf.save());
  }
}
