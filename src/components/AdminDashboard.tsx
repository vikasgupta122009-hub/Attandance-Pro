import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, firestore } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot, orderBy, limit, addDoc, writeBatch, getDoc, startAfter, QueryDocumentSnapshot, runTransaction, deleteDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, parseISO } from 'date-fns';
import { Users, QrCode, MessageSquare, Map, Edit2, CheckCircle, XCircle, LogOut, ChevronRight, MapPin, Send, Download, Briefcase, Calendar, AlertCircle, Settings, Search, AlertTriangle, Trash2, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import { QRCodeCanvas } from 'qrcode.react';
import { Attendance, User, Message, Company, Membership } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { DeviceSettings } from './DeviceSettings';
import { handleFirestoreError, OperationType } from '../lib/utils';

export function AdminDashboard() {
  const { user, logout, switchWorkspace } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'attendance' | 'qr' | 'messages' | 'settings'>('dashboard');
  const [members, setMembers] = useState<User[]>([]);
  const [lastMemberDoc, setLastMemberDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMoreMembers, setHasMoreMembers] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState<{ userId: string; date: string } | null>(null);
  const [selectedMemberHistory, setSelectedMemberHistory] = useState<User | null>(null);
  const [memberAttendance, setMemberAttendance] = useState<Attendance[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);
  const [isSwitchingRole, setIsSwitchingRole] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isDeviceSettingsOpen, setIsDeviceSettingsOpen] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<User | null>(null);
  const [showSuccessionModal, setShowSuccessionModal] = useState(false);
  const [showDissolveModal, setShowDissolveModal] = useState(false);
  const [dissolveConfirmation, setDissolveConfirmation] = useState('');
  const [successors, setSuccessors] = useState<User[]>([]);
  const [isHandingOver, setIsHandingOver] = useState(false);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  // Optimized Paginated Fetching
  const fetchMembers = async (reset = false) => {
    if (!user?.companyId || isLoadingMembers || (!hasMoreMembers && !reset)) return;

    setIsLoadingMembers(true);
    try {
      let q = query(
        collection(firestore, 'users'),
        where('companyId', '==', user.companyId),
        orderBy('name'),
        limit(20)
      );

      if (searchTerm) {
        // Simple prefix search trick: 'searchString' to 'searchString\uf8ff'
        q = query(
          collection(firestore, 'users'),
          where('companyId', '==', user.companyId),
          where('name', '>=', searchTerm),
          where('name', '<=', searchTerm + '\uf8ff'),
          orderBy('name'),
          limit(20)
        );
      }

      if (!reset && lastMemberDoc) {
        q = query(q, startAfter(lastMemberDoc));
      }

      const snap = await getDocs(q);
      const newMembers = snap.docs.map(d => d.data() as User);
      
      setMembers(prev => reset ? newMembers : [...prev, ...newMembers]);
      setLastMemberDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMoreMembers(snap.docs.length === 20);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    fetchMembers(true);
  }, [user?.companyId, searchTerm]);

  useEffect(() => {
    if (!user?.uid || !user?.companyId) return;

    // Listen for today's attendance - filtered by companyId
    const qAttendance = query(
      collection(firestore, 'attendance'), 
      where('companyId', '==', user.companyId),
      where('date', '==', todayStr)
    );
    const unsubAttendance = onSnapshot(qAttendance, (snap) => {
      setAttendance(snap.docs.map(d => d.data() as Attendance));
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn('Attendance feed restricted');
      } else {
        handleFirestoreError(error, OperationType.LIST, 'attendance');
      }
    });

    // Listen for messages
    const qMessages = query(
      collection(firestore, 'messages'),
      where('companyId', '==', user.companyId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubMessages = onSnapshot(qMessages, (snap) => {
      setMessages(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Message));
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn('Message feed restricted');
      } else {
        handleFirestoreError(error, OperationType.LIST, 'messages');
      }
    });

    return () => {
      unsubAttendance();
      unsubMessages();
    };
  }, [user?.uid, user?.companyId, todayStr]);

  // Listen for specific member history when selected
  useEffect(() => {
    if (!selectedMemberHistory?.uid || !user?.companyId) return;

    const q = query(
      collection(firestore, 'attendance'),
      where('userId', '==', selectedMemberHistory.uid),
      where('companyId', '==', user.companyId),
      orderBy('date', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snap) => {
      setMemberAttendance(snap.docs.map(d => d.data() as Attendance));
    });

    return () => unsub();
  }, [selectedMemberHistory?.uid, user?.companyId]);

  const handleOverride = async (userId: string, date: string, newStatus: 'present' | 'absent') => {
    if (!user?.companyId || !user?.companyCode) {
      alert('Workspace information missing. Please re-login.');
      return;
    }
    const attendanceId = `${userId}_${date}`;
    const record: Partial<Attendance> = {
      id: attendanceId,
      userId,
      companyId: user.companyId,
      companyCode: user.companyCode,
      date,
      status: newStatus,
      modifiedByAdmin: true,
      updatedAt: Date.now(),
    };
    
    if (newStatus === 'present') {
      record.checkInTime = Date.now();
      record.method = 'manual';
    }

    try {
      await setDoc(doc(firestore, 'attendance', attendanceId), record, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendance/${attendanceId}`);
    }
    setShowOverrideModal(null);
  };

  const exportMonthlyReport = async () => {
    if (!user?.companyId) return;
    
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    const q = query(
      collection(firestore, 'attendance'),
      where('companyId', '==', user.companyId),
      where('date', '>=', startStr),
      where('date', '<=', endStr)
    );
    let snap;
    try {
      snap = await getDocs(q);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'attendance/export');
      return;
    }
    const monthAttendance = snap.docs.map(d => d.data() as Attendance);

    const doc = new jsPDF();
    const companyTitle = user.companyName || 'Attendance Report';
    
    doc.setFontSize(20);
    doc.text(companyTitle, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Monthly Attendance Report: ${format(new Date(), 'MMMM yyyy')}`, 14, 30);
    doc.text(`Generated on: ${format(new Date(), 'PPP')}`, 14, 36);

    const tableData = members.map(member => {
      const records = monthAttendance.filter(a => a.userId === member.uid && a.status === 'present');
      const totalDaysElapsed = eachDayOfInterval({ start, end: new Date() }).length;

      return [
        member.name,
        records.length,
        totalDaysElapsed - records.length,
        `${records.length > 0 ? Math.round((records.length / totalDaysElapsed) * 100) : 0}%`
      ];
    });

    autoTable(doc, {
      startY: 45,
      head: [['Member Name', 'Present Days', 'Absent Days', 'Attendance Rate']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 }
    });

    doc.save(`${companyTitle}_${format(new Date(), 'MMMM_yyyy')}_Report.pdf`);
  };

  const exportMemberReport = async (member: User, memberRecords: Attendance[]) => {
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text(`${member.name} - Attendance Report`, 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Company: ${user?.companyName}`, 14, 30);
      doc.text(`Period: Full History (Last 100 entries)`, 14, 36);
      doc.text(`Generated on: ${format(new Date(), 'PPP')}`, 14, 42);

      const tableData = memberRecords.map(r => [
        r.date,
        r.status.toUpperCase(),
        r.checkInTime ? format(r.checkInTime, 'hh:mm a') : 'N/A',
        r.method || 'N/A',
        r.modifiedByAdmin ? 'YES' : 'NO'
      ]);

      autoTable(doc, {
        startY: 50,
        head: [['Date', 'Status', 'Check-in Time', 'Method', 'Admin Override']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] }
      });

      doc.save(`${member.name.replace(/\s+/g, '_')}_Attendance_Report.pdf`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !user?.uid || !user?.companyId) return;
    try {
      await addDoc(collection(firestore, 'messages'), {
        senderId: user.uid,
        senderName: user.name,
        companyId: user.companyId,
        content: text.trim(),
        type: 'group',
        createdAt: Date.now(),
        readBy: [user.uid]
      });
    } catch (err) {
      console.error('Send error:', err);
    }
  };

  const handleSendReply = async () => {
    if (!user || !user.companyId || !replyTo || !replyText.trim()) return;
    try {
      await addDoc(collection(firestore, 'messages'), {
        senderId: user.uid,
        senderName: user.name,
        receiverId: replyTo.senderId,
        companyId: user.companyId,
        content: replyText.trim(),
        type: 'direct',
        createdAt: Date.now(),
        read: false
      });
      setReplyTo(null);
      setReplyText('');
      alert('Reply sent!');
    } catch (err) {
      console.error(err);
    }
  };

  const regenerateCompanyCode = async () => {
    if (!user?.uid || !user?.companyId || !user?.companyCode || isRegeneratingCode) {
      alert('Workspace information incomplete. Please try again.');
      return;
    }
    
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      setTimeout(() => setConfirmRegenerate(false), 3000); // Reset after 3 seconds
      return;
    }

    setIsRegeneratingCode(true);
    setConfirmRegenerate(false);
    try {
      const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const currentCompanyId = user.companyId;
      
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'companies', currentCompanyId), {
        code: newCode,
        updatedAt: Date.now()
      });

      batch.update(doc(firestore, 'users', user.uid), {
        companyCode: newCode,
        updatedAt: Date.now()
      });
      batch.set(doc(firestore, 'users', user.uid, 'memberships', currentCompanyId), {
        companyCode: newCode,
        updatedAt: Date.now()
      }, { merge: true });

      await batch.commit();

      const membersQuery = query(
        collection(firestore, 'users'), 
        where('companyId', '==', currentCompanyId),
        limit(50)
      );
      const membersSnap = await getDocs(membersQuery);
      
      const updateBatch = writeBatch(firestore);
      membersSnap.docs.forEach(memberDoc => {
        if (memberDoc.id !== user.uid) {
          updateBatch.update(memberDoc.ref, { 
            companyCode: newCode,
            updatedAt: Date.now()
          });
          updateBatch.set(doc(firestore, 'users', memberDoc.id, 'memberships', currentCompanyId), { 
            companyCode: newCode,
            updatedAt: Date.now()
          }, { merge: true });
        }
      });
      
      if (membersSnap.size > 1) {
        await updateBatch.commit();
      }

      alert(`Success! New Group Code: ${newCode}`);
    } catch (err: any) {
      console.error('Regeneration error:', err);
      handleFirestoreError(err, OperationType.WRITE, `companies/${user?.companyId}/regenerate`);
    } finally {
      setIsRegeneratingCode(false);
    }
  };

  const [confirmSwitchRole, setConfirmSwitchRole] = useState(false);

  const switchToMember = async () => {
    if (!user || isSwitchingRole) return;
    
    if (!confirmSwitchRole) {
      setConfirmSwitchRole(true);
      setTimeout(() => setConfirmSwitchRole(false), 3000);
      return;
    }

    setIsSwitchingRole(true);
    setConfirmSwitchRole(false);
    try {
      // Use the robust switchWorkspace logic for a full identity reset
      await switchWorkspace(user.companyId || '', user.companyCode || '', user.companyName || '', 'worker');
    } catch (err: any) {
      console.error('Role switch error:', err);
      alert(`Error: ${err.message || 'Failed to switch role'}`);
      setIsSwitchingRole(false);
    }
  };

  const handleRemoveMember = async (targetUser: User) => {
    if (!user?.companyId || !targetUser.uid) return;
    
    setRemovingMemberId(targetUser.uid);
    try {
      const batch = writeBatch(firestore);
      
      // Update target user's profile to clear company info
      batch.update(doc(firestore, 'users', targetUser.uid), {
        companyId: '',
        companyCode: '',
        companyName: '',
        updatedAt: Date.now()
      });

      // Delete the membership entry
      batch.delete(doc(firestore, 'users', targetUser.uid, 'memberships', user.companyId));
      
      await batch.commit();
      
      // Refresh list locally
      setMembers(prev => prev.filter(w => w.uid !== targetUser.uid));
      setMemberToRemove(null);
    } catch (err: any) {
      console.error('Remove member error:', err);
      handleFirestoreError(err, OperationType.WRITE, `users/${targetUser.uid}/remove`);
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleSuccessionInit = async () => {
    if (!user?.companyId) return;

    // Use current members as a fast path
    const currentWorkers = members.filter(m => m.role === 'worker' && m.uid !== user.uid);
    if (currentWorkers.length > 0) {
      setSuccessors(currentWorkers);
      setShowSuccessionModal(true);
      return;
    }

    setIsLoadingMembers(true);
    try {
      const q = query(
        collection(firestore, 'users'),
        where('companyId', '==', user.companyId),
        where('role', '==', 'worker'),
        limit(50)
      );
      const snap = await getDocs(q);
      const workers = snap.docs.map(d => d.data() as User).filter(w => w.uid !== user.uid);
      setSuccessors(workers);
      setShowSuccessionModal(true);
    } catch (error) {
      console.error(error);
      alert('Failed to load workers for succession.');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const handleAtomicHandover = async (successorId: string) => {
    if (!user?.companyId || !user?.uid) return;
    setIsHandingOver(true);
    try {
      await runTransaction(firestore, async (transaction) => {
        const companyRef = doc(firestore, 'companies', user.companyId!);
        const successorMembershipRef = doc(firestore, 'users', successorId, 'memberships', user.companyId!);
        const currentMembershipRef = doc(firestore, 'users', user.uid, 'memberships', user.companyId!);
        const successorDocRef = doc(firestore, 'users', successorId);
        const currentUserDocRef = doc(firestore, 'users', user.uid);

        // 1. READS: All reads must happen before any writes
        const successorSnap = await transaction.get(successorDocRef);
        
        // 2. WRITES:
        // Handover primary admin ID
        transaction.update(companyRef, { adminId: successorId });

        // Promote successor role in membership
        transaction.update(successorMembershipRef, { role: 'admin' });

        // Promote successor role globally if active in this workspace
        if (successorSnap.exists()) {
          const successorData = successorSnap.data();
          if (successorData?.activeWorkspace === user.companyId) {
            transaction.update(successorDocRef, { role: 'admin' });
          }
        }

        // Remove current admin's membership
        transaction.delete(currentMembershipRef);
        
        // Clear current user's global company context
        transaction.update(currentUserDocRef, {
           companyId: '',
           companyCode: '',
           companyName: '',
           role: 'worker',
           activeWorkspace: '', // Explicitly clear active workspace
           updatedAt: Date.now()
        });
      });

      setShowSuccessionModal(false);
      alert('Succession Complete: Admin rights transferred and you have stepped down.');
      window.location.reload();
    } catch (error: any) {
      console.error('Handover Error:', error);
      alert(`Handover failed: ${error.message || 'Check permissions.'}`);
    } finally {
      setIsHandingOver(false);
    }
  };

  const handleDissolveOrg = async () => {
    if (!user?.companyId || !user?.uid) return;
    if (dissolveConfirmation !== 'DISSOLVE') {
      alert("Invalid confirmation. Action aborted.");
      return;
    }

    setShowDissolveModal(false);
    setIsRegeneratingCode(true); // Reusing a loading state
    try {
      const companyId = user.companyId;
      // 1. Delete Company
      await deleteDoc(doc(firestore, 'companies', companyId));
      
      // 2. Clear current user's membership
      await deleteDoc(doc(firestore, 'users', user.uid, 'memberships', companyId));
      
      // 3. Clear global user context
      await setDoc(doc(firestore, 'users', user.uid), {
         companyId: '',
         companyCode: '',
         companyName: '',
         role: 'worker',
         activeWorkspace: '',
         updatedAt: Date.now()
      }, { merge: true });

      alert('Organization dissolved successfully. Redirecting...');
      window.location.reload();
    } catch (error: any) {
      console.error('Dissolve Error:', error);
      alert(`Dissolution failed: ${error.message || 'Check permissions.'}`);
    } finally {
      setIsRegeneratingCode(false);
      setDissolveConfirmation('');
    }
  };

  const presentCount = attendance.filter(a => a.status === 'present').length;
  const absentCount = members.length - presentCount;

  return (
    <div className="bg-slate-50 min-h-screen pb-24 font-sans">
      {/* Universal Admin Header */}
      <header className="bg-white p-4 md:p-6 shadow-sm flex justify-between items-center sticky top-0 z-30 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <div className="hidden md:flex w-12 h-12 bg-indigo-600 rounded-2xl items-center justify-center text-white shadow-lg shadow-indigo-100">
            <Briefcase size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase leading-none">{user?.companyName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Console Executive</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={exportMonthlyReport}
            className="hidden md:flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest bg-indigo-50 px-4 py-2.5 rounded-xl hover:bg-indigo-100 transition-all active:scale-95"
          >
            <Download size={14} />
            Monthly PDF
          </button>
          <button 
            onClick={logout} 
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all group border border-slate-200 hover:border-rose-100 active:scale-95"
          >
            <LogOut size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">Logout</span>
          </button>
          <button 
            onClick={switchToMember}
            disabled={isSwitchingRole}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all active:scale-95 border ${
              confirmSwitchRole 
                ? 'bg-rose-500 text-white border-rose-600' 
                : 'bg-white text-indigo-600 border-indigo-100 hover:bg-slate-50'
            }`}
          >
            <Briefcase size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">
              {confirmSwitchRole ? 'Confirm Switch?' : 'Switch to Member'}
            </span>
          </button>
          <button 
            onClick={() => setIsSwitcherOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-100"
          >
            <Settings size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">Switch Workspace</span>
          </button>
        </div>
      </header>

      <WorkspaceSwitcher 
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
      />

      <AnimatePresence>
        {isDeviceSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsDeviceSettingsOpen(false)}
               className="absolute inset-0 bg-slate-900/90 backdrop-blur-md"
             />
             <motion.div
               initial={{ scale: 0.9, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               exit={{ scale: 0.9, y: 20 }}
               className="relative w-full max-w-sm bg-slate-50 rounded-[3rem] p-8 shadow-2xl overflow-hidden"
             >
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                  <Smartphone size={120} />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 mb-6">Device Configuration</h3>
                <DeviceSettings onClose={() => setIsDeviceSettingsOpen(false)} />
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Daily Summary Hub */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-2 group hover:border-indigo-200 transition-all">
                  <div className="flex justify-between items-start">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Workforce</p>
                    <Users size={16} className="text-slate-300" />
                  </div>
                  <div className="flex items-end gap-3 pt-2">
                    <h2 className="text-5xl font-black text-slate-900 leading-none">{members.length}</h2>
                    <span className="text-xs font-black text-slate-400 pb-1">Members</span>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-2 border-l-8 border-l-emerald-500">
                  <div className="flex justify-between items-start">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Present Today</p>
                    <CheckCircle size={16} className="text-emerald-500" />
                  </div>
                  <div className="flex items-end gap-3 pt-2">
                    <h2 className="text-5xl font-black text-emerald-600 leading-none">{presentCount}</h2>
                    <span className="text-xs font-black text-emerald-400 pb-1">Clocked In</span>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-2 border-l-8 border-l-rose-500">
                  <div className="flex justify-between items-start">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Absent Today</p>
                    <XCircle size={16} className="text-rose-500" />
                  </div>
                  <div className="flex items-end gap-3 pt-2">
                    <h2 className="text-5xl font-black text-rose-600 leading-none">{absentCount}</h2>
                    <span className="text-xs font-black text-rose-400 pb-1">Pending</span>
                  </div>
                </div>
              </div>

              {/* Real-Time Workforce List */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/50">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                     <div className="w-2 h-2 bg-emerald-500 rounded-full" /> Live Site Feed
                  </h3>
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text"
                      placeholder="Search members..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">{format(new Date(), 'EEEE, do MMMM')}</p>
                </div>
                
                <div className="overflow-x-auto">
                  <div className="min-w-[800px]">
                    <div className="bg-slate-50/50 border-b border-slate-100 flex items-center sticky top-0 z-10 backdrop-blur-sm">
                      <div className="w-1/3 px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Personnel</div>
                      <div className="w-1/6 px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</div>
                      <div className="w-1/6 px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Method</div>
                      <div className="w-1/4 px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Verification</div>
                      <div className="w-1/12 px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</div>
                    </div>
                    <Virtuoso
                      useWindowScroll
                      data={members}
                      endReached={() => fetchMembers()}
                      itemContent={(index, member) => {
                        const record = attendance.find(a => a.userId === member.uid);
                        const isPresent = record?.status === 'present';
                        
                        return (
                          <div 
                            key={member.uid}
                            className="hover:bg-slate-50/80 transition-all cursor-pointer group flex items-center border-b border-slate-50 bg-white"
                            onClick={() => setSelectedMemberHistory(member)}
                          >
                            <div className="w-1/3 px-6 py-5 flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 ${isPresent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                {member.name?.substring(0, 2).toUpperCase() || '??'}
                              </div>
                              <div className="truncate">
                                <p className="text-sm font-black text-slate-800 truncate">{member.name || 'Unknown'}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate">ID: {member.uid.substring(0, 8)}</p>
                              </div>
                            </div>
                            <div className="w-1/6 px-6 py-5">
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                isPresent ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                              }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${isPresent ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                                {isPresent ? 'Present' : 'Absent'}
                              </div>
                            </div>
                            <div className="w-1/6 px-6 py-5">
                              {isPresent ? (
                                <div className="flex items-center gap-2 text-slate-600 font-bold text-[10px] uppercase">
                                  {record.method === 'qr' ? <QrCode size={14} className="text-indigo-400" /> : <Edit2 size={14} className="text-slate-400" />}
                                  {record.method}
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </div>
                            <div className="w-1/4 px-6 py-5 overflow-hidden">
                              {isPresent ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                    <MapPin size={12} className="text-rose-500" />
                                    {record.location ? (
                                      <a 
                                        href={`https://www.google.com/maps?q=${record.location.lat},${record.location.lng}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-indigo-600 underline hover:text-indigo-800 truncate"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View Map
                                      </a>
                                    ) : 'No GPS'}
                                  </div>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                    {record.checkInTime ? format(record.checkInTime, 'hh:mm a') : 'No Time'}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-slate-300">Pending</span>
                              )}
                            </div>
                            <div className="w-1/12 px-6 py-5 text-right flex justify-end items-center">
                               <button 
                                 onClick={(e) => { e.stopPropagation(); setShowOverrideModal({ userId: member.uid, date: todayStr }); }}
                                 className="opacity-0 group-hover:opacity-100 p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all border border-indigo-100"
                               >
                                 <Edit2 size={16} />
                               </button>
                            </div>
                          </div>
                        );
                      }}
                      components={{
                        Footer: () => isLoadingMembers ? (
                          <div className="p-4 text-center text-xs font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Loading more...</div>
                        ) : !hasMoreMembers && members.length > 0 ? (
                          <div className="p-8 text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">End of Site Feed</div>
                        ) : null
                      }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'attendance' && (
            <motion.div
              key="attendance"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Personnel Management</h3>
                  <button 
                    onClick={exportMonthlyReport}
                    className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest bg-indigo-50 px-4 py-2.5 rounded-xl border border-indigo-100 hover:bg-white transition-all shadow-sm active:scale-95"
                  >
                    <Download size={14} />
                    Download Monthly Company PDF
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {members.length > 0 ? (
                    <div className="col-span-full">
                      <VirtuosoGrid
                        useWindowScroll
                        data={members}
                        endReached={() => fetchMembers()}
                        listClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        itemContent={(index, member) => (
                          <div key={member.uid} className="bg-slate-50 border border-slate-200 rounded-[2rem] p-6 space-y-4 relative overflow-hidden">
                             {member.role === 'admin' && (
                               <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[8px] font-black px-3 py-1 uppercase tracking-widest rounded-bl-xl shadow-sm">Admin</div>
                             )}
                             <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-2xl bg-white border flex items-center justify-center font-black text-lg ${member.role === 'admin' ? 'text-indigo-600 border-indigo-200' : 'text-slate-400 border-slate-200'}`}>
                                  {member.name?.substring(0, 1).toUpperCase() || '?'}
                                </div>
                                <h4 className="font-black text-slate-800 uppercase tracking-tight truncate">{member.name || 'Unknown Member'}</h4>
                             </div>
                             <div className="space-y-2">
                                <button 
                                  onClick={() => setSelectedMemberHistory(member)}
                                  className="w-full py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                                >
                                  <Calendar size={14} /> View Member History
                                </button>
                                {user?.uid !== member.uid && (
                                  <button 
                                    onClick={() => setMemberToRemove(member)}
                                    disabled={removingMemberId === member.uid}
                                    className="w-full py-3 bg-rose-50 border-2 border-rose-100 rounded-xl font-black text-[10px] uppercase tracking-widest text-rose-500 hover:bg-rose-100 hover:border-rose-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                  >
                                    {removingMemberId === member.uid ? (
                                      <div className="w-3 h-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <XCircle size={14} />
                                    )}
                                    {removingMemberId === member.uid ? 'Removing...' : 'Remove Member'}
                                  </button>
                                )}
                             </div>
                          </div>
                        )}
                        components={{
                          Footer: () => isLoadingMembers ? (
                            <div className="col-span-full py-8 text-center text-xs font-black text-indigo-400 uppercase tracking-widest animate-pulse">Loading more personnel...</div>
                          ) : null
                        }}
                      />
                    </div>
                  ) : !isLoadingMembers && (
                    <div className="col-span-full text-center p-20 text-slate-400 italic">No personnel found.</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'qr' && (
            <motion.div
              key="qr"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-md mx-auto space-y-8"
            >
              {/* Group Invite Code */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm text-center space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Organization Invite Code</p>
                <div className="bg-slate-50 p-6 rounded-3xl border-4 border-slate-100 inline-block relative group">
                   <h2 className="text-5xl font-black text-indigo-600 tracking-[0.2em]">{user?.companyCode}</h2>
                   <div className="absolute inset-0 bg-indigo-600 text-white rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer font-black uppercase text-xs tracking-widest">Copy Code</div>
                </div>
                <button
                  onClick={regenerateCompanyCode}
                  disabled={isRegeneratingCode}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all border disabled:opacity-50 ${
                    confirmRegenerate 
                      ? 'bg-rose-500 text-white border-rose-600 scale-105 shadow-lg' 
                      : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  {isRegeneratingCode 
                    ? 'Regenerating...' 
                    : confirmRegenerate 
                      ? 'Click again to confirm' 
                      : 'Reset Group Invite Code'
                  }
                </button>
                <p className="text-xs text-slate-500 font-medium px-8 leading-relaxed">This will stop the old code from working. Generate a new code for new members to join. Current members will be updated automatically.</p>
              </div>

              {/* Permanent QR Code */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm text-center space-y-6">
                <div className="space-y-1">
                   <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Site Verification QR</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Permanent Code • Never Expires</p>
                </div>
                
                <div className="bg-white p-6 rounded-3xl border-8 border-slate-100 inline-block shadow-inner overflow-hidden">
                  <QRCodeCanvas 
                    id="qr-canvas"
                    value={user?.companyCode || ''} 
                    size={220} 
                    level="H" 
                    includeMargin={true}
                  />
                </div>

                <div className="pt-4 flex flex-col gap-3">
                   <button 
                    onClick={() => {
                      const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
                      if (canvas) {
                        const link = document.createElement('a');
                        link.download = `QR_${user?.companyCode}.png`;
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                      }
                    }}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all flex items-center justify-center gap-2"
                   >
                      <Download size={16} /> Download QR for Printing
                   </button>
                   <p className="text-[10px] text-slate-400 font-bold px-12 italic">Members can scan this QR using the "Scan QR" button in their interface to verify on-site presence.</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'messages' && (
            <motion.div
              key="messages"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
               <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
                   <div>
                     <h3 className="text-xl font-black uppercase tracking-tight">Team Broadcast</h3>
                     <p className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-[0.2em] mt-1">Send to all members</p>
                   </div>
                   <MessageSquare className="text-indigo-400 opacity-50" size={30} />
                </div>

                <div className="p-6 bg-slate-50 border-b border-slate-100">
                   <div className="flex gap-4">
                      <input 
                        type="text" 
                        value={messageInput} 
                        onChange={(e) => setMessageInput(e.target.value)}
                        placeholder="Type a group announcement..."
                        className="flex-1 bg-white p-4 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                      />
                      <button 
                        onClick={() => {
                          sendMessage(messageInput);
                          setMessageInput('');
                        }}
                        className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center aspect-square"
                      >
                         <Send size={20} />
                      </button>
                   </div>
                </div>
                
                <div className="p-8 border-b border-slate-100">
                   <h3 className="text-xl font-black text-slate-900 uppercase">Incoming Reports</h3>
                   <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Filtered by Organization</p>
                </div>
                
                <div className="divide-y divide-slate-100">
                  {messages.length === 0 ? (
                    <div className="p-20 text-center text-slate-400 italic">No incoming reports yet.</div>
                  ) : (
                    messages.map((m) => {
                      const sender = members.find(w => w.uid === m.senderId);
                      return (
                        <div key={m.id} className="p-6 hover:bg-slate-50 transition-all flex gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black">
                              {sender?.name?.substring(0, 1).toUpperCase() || '?'}
                           </div>
                           <div className="flex-1 space-y-2">
                              <div className="flex justify-between items-start">
                                 <h4 className="font-black text-slate-800 uppercase text-xs tracking-tight">{sender?.name || 'Unknown'}</h4>
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{format(m.createdAt, 'hh:mm a')}</span>
                              </div>
                              <p className="text-sm text-slate-600 leading-relaxed bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">{m.content}</p>
                              <div className="flex gap-2">
                                 <button 
                                  onClick={() => setReplyTo(m)}
                                  className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100"
                                 >
                                    Reply
                                 </button>
                                 {!m.read && <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg font-black text-[10px] uppercase tracking-widest">New Report</div>}
                              </div>
                           </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
                   <div className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center text-slate-400">
                      <Settings size={24} />
                   </div>
                   <div>
                     <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Organization Settings</h3>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Management Control Panel</p>
                   </div>
                </div>

                <div className="p-8 space-y-12">
                    {/* Danger Zone */}
                    <div className="space-y-6">
                       <div className="flex items-center gap-3 text-rose-600">
                          <AlertTriangle size={20} />
                          <h4 className="font-black uppercase tracking-widest text-xs">Danger Zone</h4>
                       </div>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl space-y-4">
                             <div>
                                <h5 className="font-black text-rose-900 uppercase text-xs tracking-tight">Admin Succession Handover</h5>
                                <p className="text-[10px] text-rose-700 font-bold mt-1 leading-relaxed italic">promote a worker to primary administrator and step down securely. This transfers ownership immediately.</p>
                             </div>
                             <button 
                               onClick={handleSuccessionInit}
                               className="w-full px-6 py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 active:scale-95 flex items-center justify-center gap-2"
                             >
                                <Shield size={14} /> Promote & Handover
                             </button>
                          </div>

                          <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl space-y-4">
                             <div>
                                <h5 className="font-black text-slate-900 uppercase text-xs tracking-tight">Dissolve Organization</h5>
                                <p className="text-[10px] text-slate-500 font-bold mt-1 leading-relaxed italic">permanently erase all group records, attendance history, and site data. This action is irreversible.</p>
                             </div>
                             <button 
                               onClick={() => setShowDissolveModal(true)}
                               className="w-full px-6 py-3 border-2 border-rose-200 text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                             >
                                <Trash2 size={14} /> Dissolve Group
                             </button>
                          </div>
                       </div>
                    </div>

                    {/* Account & Session Section */}
                    <div className="space-y-6 pt-6 border-t border-slate-100">
                       <div className="flex items-center gap-3 text-slate-600">
                          <Smartphone size={20} />
                          <h4 className="font-black uppercase tracking-widest text-xs">Device & Session</h4>
                       </div>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl space-y-4">
                             <div>
                                <h5 className="font-black text-slate-900 uppercase text-xs tracking-tight">App Configuration</h5>
                                <p className="text-[10px] text-slate-500 font-bold mt-1 leading-relaxed italic">Manage local bridge and device cache settings.</p>
                             </div>
                             <button 
                               onClick={() => setIsDeviceSettingsOpen(true)}
                               className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 flex items-center justify-center gap-2"
                             >
                                <Settings size={14} /> Open Device Settings
                             </button>
                          </div>

                          <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4">
                             <div>
                                <h5 className="font-black text-slate-900 uppercase text-xs tracking-tight">Session Exit</h5>
                                <p className="text-[10px] text-slate-500 font-bold mt-1 leading-relaxed italic">Securely sign out of your account on this device.</p>
                             </div>
                             <button 
                               onClick={logout}
                               className="w-full px-6 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                             >
                                <LogOut size={14} /> Logout Session
                             </button>
                          </div>
                       </div>
                    </div>
                   
                   <div className="pt-6 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center italic leading-relaxed">
                        system audit: all administrative changes are logged with server-side integrity checks
                      </p>
                   </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Succession Modal */}
        <AnimatePresence>
          {showSuccessionModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
               <motion.div
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 onClick={() => !isHandingOver && setShowSuccessionModal(false)}
                 className="absolute inset-0 bg-rose-950/90 backdrop-blur-xl"
               />
               <motion.div
                 initial={{ scale: 0.9, y: 20 }}
                 animate={{ scale: 1, y: 0 }}
                 exit={{ scale: 0.9, y: 20 }}
                 className="relative w-full max-w-sm bg-white rounded-[3rem] p-8 shadow-2xl overflow-hidden"
               >
                  <div className="text-center space-y-6">
                     <div className="w-20 h-20 bg-rose-50 border-4 border-rose-100 rounded-[2.5rem] flex items-center justify-center mx-auto">
                        <Shield size={32} className="text-rose-600" />
                     </div>
                     <div className="space-y-1">
                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic">Succession Protocol</h3>
                        <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Select your Successor</p>
                     </div>

                     <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 flex items-start gap-3">
                        <AlertTriangle className="text-rose-600 shrink-0" size={18} />
                        <p className="text-[10px] text-rose-900 font-bold text-left leading-relaxed">
                          You are transferring primary ownership. The selected member will gain full Administrative powers and you will be removed from the group.
                        </p>
                     </div>

                     <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {successors.length === 0 ? (
                          <p className="text-xs text-slate-400 italic py-8">No workers available for promotion.</p>
                        ) : (
                          successors.map(worker => (
                            <button
                              key={worker.uid}
                              onClick={() => handleAtomicHandover(worker.uid)}
                              disabled={isHandingOver}
                              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all group disabled:opacity-50"
                            >
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-[10px] text-slate-500">
                                     {worker.name?.substring(0, 1).toUpperCase()}
                                  </div>
                                  <div className="text-left">
                                     <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{worker.name}</p>
                                     <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{worker.email}</p>
                                  </div>
                               </div>
                               <ChevronRight size={14} className="text-rose-400" />
                            </button>
                          ))
                        )}
                     </div>

                     <button
                       onClick={() => setShowSuccessionModal(false)}
                       disabled={isHandingOver}
                       className="w-full py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                     >
                       Abort Handover
                     </button>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Dissolve Modal */}
        <AnimatePresence>
          {showDissolveModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
               <motion.div
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 onClick={() => setShowDissolveModal(false)}
                 className="absolute inset-0 bg-slate-950/95 backdrop-blur-2xl"
               />
               <motion.div
                 initial={{ scale: 0.9, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 exit={{ scale: 0.9, opacity: 0 }}
                 className="relative w-full max-w-sm bg-white rounded-[3rem] p-8 shadow-2xl overflow-hidden"
               >
                  <div className="text-center space-y-6">
                     <div className="w-20 h-20 bg-rose-50 border-4 border-rose-100 rounded-[2.5rem] flex items-center justify-center mx-auto text-rose-600">
                        <AlertTriangle size={32} />
                     </div>
                     <div className="space-y-1">
                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic">Nuclear Option</h3>
                        <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Permanent Dissolution</p>
                     </div>

                     <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                        <p className="text-[10px] text-rose-900 font-bold leading-relaxed">
                          This erases everything. Attendance, team records, and organization credentials will be deleted forever.
                        </p>
                     </div>

                     <div className="space-y-2">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Type DISSOLVE to confirm</p>
                        <input 
                           type="text"
                           value={dissolveConfirmation}
                           onChange={(e) => setDissolveConfirmation(e.target.value)}
                           className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 focus:border-rose-500 outline-none transition-all text-center font-black uppercase text-xs"
                           placeholder="DISSOLVE"
                        />
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setShowDissolveModal(false)}
                          className="py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDissolveOrg}
                          disabled={dissolveConfirmation !== 'DISSOLVE'}
                          className="py-4 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-rose-700 shadow-xl shadow-rose-100 disabled:opacity-50"
                        >
                          Dissolve
                        </button>
                     </div>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Admin Mobile Nav */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-2 rounded-2xl flex gap-1 shadow-2xl z-40 border border-white/10 backdrop-blur-md">
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          <Map size={18} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'dashboard' ? 'block' : 'hidden md:block'}`}>Live Feed</span>
        </button>
        <button 
          onClick={() => setActiveTab('attendance')} 
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'attendance' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          <Users size={18} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'attendance' ? 'block' : 'hidden md:block'}`}>Team</span>
        </button>
        <button 
          onClick={() => setActiveTab('qr')} 
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'qr' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          <QrCode size={18} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'qr' ? 'block' : 'hidden md:block'}`}>QR Site</span>
        </button>
        <button 
          onClick={() => setActiveTab('messages')} 
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'messages' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          <MessageSquare size={18} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'messages' ? 'block' : 'hidden md:block'}`}>Support</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')} 
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          <Settings size={18} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'settings' ? 'block' : 'hidden md:block'}`}>Org Settings</span>
        </button>
      </nav>

      {/* Member History Modal */}
      {selectedMemberHistory && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl">
                    {selectedMemberHistory.name?.substring(0, 1).toUpperCase() || '?'}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{selectedMemberHistory.name}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Member Full History</p>
                  </div>
               </div>
               <div className="flex gap-2">
                 <button 
                   onClick={() => exportMemberReport(selectedMemberHistory, memberAttendance)}
                   disabled={isGeneratingPdf}
                   className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all"
                   title="Download Member PDF"
                 >
                   <Download size={20} />
                 </button>
                 <button onClick={() => setSelectedMemberHistory(null)} className="p-3 bg-slate-100 text-slate-400 hover:text-slate-900 rounded-xl transition-all"><XCircle size={24} /></button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
               <div className="grid grid-cols-1 gap-4">
                  {memberAttendance.length === 0 ? (
                    <div className="text-center py-20 text-slate-400 italic">No attendance records found for this member.</div>
                  ) : (
                    memberAttendance.map(record => (
                      <div key={record.id} className="bg-white border border-slate-100 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                         <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${record.status === 'present' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
                              {record.status === 'present' ? <CheckCircle size={20} /> : <XCircle size={20} />}
                            </div>
                            <div>
                               <p className="text-sm font-black text-slate-800">{format(parseISO(record.date), 'EEEE, MMMM do')}</p>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                 {record.status === 'present' ? `Checked in at ${format(record.checkInTime!, 'hh:mm a')}` : 'Marked Absent'}
                               </p>
                            </div>
                         </div>
                         <div className="flex items-center gap-2">
                            {record.modifiedByAdmin && (
                               <div className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[8px] font-black uppercase tracking-widest border border-amber-100">Adjusted by Admin</div>
                            )}
                            <button 
                              onClick={() => setShowOverrideModal({ userId: selectedMemberHistory.uid, date: record.date })}
                              className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                         </div>
                      </div>
                    ))
                  )}
               </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Reply Modal */}
      {replyTo && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl relative"
          >
            <button onClick={() => setReplyTo(null)} className="absolute top-6 right-6 text-slate-400"><XCircle size={24} /></button>
            <div className="space-y-6">
               <div className="space-y-1">
                 <h3 className="text-lg font-black text-slate-900 uppercase">Reply to {replyTo.senderName}</h3>
                 <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-500 italic border border-slate-100">
                    "{replyTo.content}"
                 </div>
               </div>
               <textarea 
                 value={replyText}
                 onChange={(e) => setReplyText(e.target.value)}
                 className="w-full h-32 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 outline-none focus:border-indigo-400 transition-all text-sm"
                 placeholder="Type your response here..."
               />
               <button 
                 onClick={handleSendReply}
                 disabled={!replyText.trim()}
                 className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
               >
                 Send Response
               </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Manual Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative"
          >
            <button onClick={() => setShowOverrideModal(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-900"><XCircle size={24} /></button>
            <div className="text-center space-y-6 pt-4">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto border-4 border-indigo-100">
                <Edit2 size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Manual Override</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID: {showOverrideModal.userId.substring(0, 12)}</p>
                <p className="text-xs text-slate-500 font-medium">Resetting attendance status for {showOverrideModal.date}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-4">
                <button 
                  onClick={() => handleOverride(showOverrideModal.userId, showOverrideModal.date, 'present')}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-100 hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  Force Mark: Present
                </button>
                <button 
                  onClick={() => handleOverride(showOverrideModal.userId, showOverrideModal.date, 'absent')}
                  className="w-full py-4 bg-rose-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-rose-100 hover:bg-rose-600 active:scale-95 transition-all"
                >
                  Force Mark: Absent
                </button>
                <button 
                  onClick={() => setShowOverrideModal(null)}
                  className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
                >
                  Cancel Access
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {memberToRemove && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative"
          >
            <button onClick={() => setMemberToRemove(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-900">
              <XCircle size={24} />
            </button>
            <div className="text-center space-y-6 pt-4">
              <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-[2rem] flex items-center justify-center mx-auto border-4 border-rose-100">
                {memberToRemove.role === 'admin' ? <AlertTriangle size={32} /> : <AlertCircle size={32} />}
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {memberToRemove.role === 'admin' ? 'Remove Admin?' : 'Remove Member?'}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Are you sure you want to remove <span className="font-black text-slate-800">{memberToRemove.name}</span>? 
                  {memberToRemove.role === 'admin' ? ' This administrator will lose all dashboard privileges.' : ' They will lose access to the group and site logs immediately.'}
                </p>
              </div>
              
              <div className="grid grid-cols-1 gap-3 pt-2">
                <button 
                  onClick={() => handleRemoveMember(memberToRemove)}
                  disabled={!!removingMemberId}
                  className="w-full py-4 bg-rose-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-rose-200 hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"
                  id="confirm-remove-btn"
                >
                  {removingMemberId ? 'Processing...' : 'Confirm Removal'}
                </button>
                <button 
                  onClick={() => setMemberToRemove(null)}
                  disabled={!!removingMemberId}
                  className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all rounded-2xl"
                  id="cancel-remove-btn"
                >
                  Discard Action
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
