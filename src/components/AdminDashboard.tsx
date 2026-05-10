import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, firestore } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot, orderBy, limit, addDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, parseISO } from 'date-fns';
import { Users, QrCode, MessageSquare, Map, Edit2, CheckCircle, XCircle, LogOut, ChevronRight, MapPin, Send, Download, Briefcase, Calendar, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Attendance, User, Message, Company } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { handleFirestoreError, OperationType } from '../lib/utils';

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'attendance' | 'qr' | 'messages'>('dashboard');
  const [workers, setWorkers] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showOverrideModal, setShowOverrideModal] = useState<{ userId: string; date: string } | null>(null);
  const [selectedWorkerHistory, setSelectedWorkerHistory] = useState<User | null>(null);
  const [workerAttendance, setWorkerAttendance] = useState<Attendance[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [replyText, setReplyText] = useState('');

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (!user?.companyCode) return;

    // Listen for workers
    const qWorkers = query(collection(firestore, 'users'), where('companyCode', '==', user.companyCode), where('role', '==', 'worker'));
    const unsubWorkers = onSnapshot(qWorkers, (snap) => {
      setWorkers(snap.docs.map(d => d.data() as User));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    // Listen for today's attendance - filtered by companyCode
    const qAttendance = query(
      collection(firestore, 'attendance'), 
      where('companyCode', '==', user.companyCode),
      where('date', '==', todayStr)
    );
    const unsubAttendance = onSnapshot(qAttendance, (snap) => {
      setAttendance(snap.docs.map(d => d.data() as Attendance));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'attendance');
    });

    // Listen for messages
    const qMessages = query(
      collection(firestore, 'messages'),
      where('receiverId', '==', user.uid),
      where('companyCode', '==', user.companyCode),
      limit(50)
    );
    const unsubMessages = onSnapshot(qMessages, (snap) => {
      const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }) as Message);
      // Sort in memory
      docs.sort((a, b) => b.createdAt - a.createdAt);
      setMessages(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'messages');
    });

    return () => {
      unsubWorkers();
      unsubAttendance();
      unsubMessages();
    };
  }, [user, todayStr]);

  // Listen for specific worker history when selected
  useEffect(() => {
    if (!selectedWorkerHistory || !user?.companyCode) return;

    const q = query(
      collection(firestore, 'attendance'),
      where('userId', '==', selectedWorkerHistory.uid),
      where('companyCode', '==', user.companyCode),
      orderBy('date', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snap) => {
      setWorkerAttendance(snap.docs.map(d => d.data() as Attendance));
    });

    return () => unsub();
  }, [selectedWorkerHistory, user?.companyCode]);

  const handleOverride = async (userId: string, date: string, newStatus: 'present' | 'absent') => {
    const attendanceId = `${userId}_${date}`;
    const record: Partial<Attendance> = {
      id: attendanceId,
      userId,
      companyCode: user?.companyCode!,
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
    if (!user?.companyCode) return;
    
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    const q = query(
      collection(firestore, 'attendance'),
      where('companyCode', '==', user.companyCode),
      where('date', '>=', startStr),
      where('date', '<=', endStr)
    );
    const snap = await getDocs(q);
    const monthAttendance = snap.docs.map(d => d.data() as Attendance);

    const doc = new jsPDF();
    const companyTitle = user.companyName || 'Attendance Report';
    
    doc.setFontSize(20);
    doc.text(companyTitle, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Monthly Attendance Report: ${format(new Date(), 'MMMM yyyy')}`, 14, 30);
    doc.text(`Generated on: ${format(new Date(), 'PPP')}`, 14, 36);

    const tableData = workers.map(worker => {
      const records = monthAttendance.filter(a => a.userId === worker.uid && a.status === 'present');
      const totalDaysElapsed = eachDayOfInterval({ start, end: new Date() }).length;

      return [
        worker.name,
        records.length,
        totalDaysElapsed - records.length,
        `${records.length > 0 ? Math.round((records.length / totalDaysElapsed) * 100) : 0}%`
      ];
    });

    autoTable(doc, {
      startY: 45,
      head: [['Worker Name', 'Present Days', 'Absent Days', 'Attendance Rate']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 }
    });

    doc.save(`${companyTitle}_${format(new Date(), 'MMMM_yyyy')}_Report.pdf`);
  };

  const exportWorkerReport = async (worker: User, workerRecords: Attendance[]) => {
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text(`${worker.name} - Attendance Report`, 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Company: ${user?.companyName}`, 14, 30);
      doc.text(`Period: Full History (Last 100 entries)`, 14, 36);
      doc.text(`Generated on: ${format(new Date(), 'PPP')}`, 14, 42);

      const tableData = workerRecords.map(r => [
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

      doc.save(`${worker.name.replace(/\s+/g, '_')}_Attendance_Report.pdf`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSendReply = async () => {
    if (!user || !replyTo || !replyText.trim()) return;
    try {
      await addDoc(collection(firestore, 'messages'), {
        senderId: user.uid,
        senderName: user.companyName || 'Admin',
        receiverId: replyTo.senderId,
        companyCode: user.companyCode,
        content: replyText.trim(),
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

  const presentCount = attendance.filter(a => a.status === 'present').length;
  const absentCount = workers.length - presentCount;

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
            <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">Switch Portal</span>
          </button>
        </div>
      </header>

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
                    <h2 className="text-5xl font-black text-slate-900 leading-none">{workers.length}</h2>
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
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                     <div className="w-2 h-2 bg-emerald-500 rounded-full" /> Live Site Feed
                  </h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">{format(new Date(), 'EEEE, do MMMM')}</p>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Personnel</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Method</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Verification</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {workers.map(worker => {
                        const record = attendance.find(a => a.userId === worker.uid);
                        const isPresent = record?.status === 'present';
                        
                        return (
                          <motion.tr 
                            key={worker.uid}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="hover:bg-slate-50/80 transition-all cursor-pointer group"
                            onClick={() => setSelectedWorkerHistory(worker)}
                          >
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${isPresent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                  {worker.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-slate-800">{worker.name}</p>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">ID: {worker.uid.substring(0, 8)}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                isPresent ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                              }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${isPresent ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                                {isPresent ? 'Present' : 'Absent'}
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              {isPresent ? (
                                <div className="flex items-center gap-2 text-slate-600 font-bold text-[10px] uppercase">
                                  {record.method === 'qr' ? <QrCode size={14} className="text-indigo-400" /> : <Edit2 size={14} className="text-slate-400" />}
                                  {record.method}
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-6 py-5">
                              {isPresent ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                    <MapPin size={12} className="text-rose-500" />
                                    {record.location ? (
                                      <a 
                                        href={`https://www.google.com/maps?q=${record.location.lat},${record.location.lng}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-indigo-600 underline hover:text-indigo-800"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View Map
                                      </a>
                                    ) : 'No GPS'}
                                  </div>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{format(record.checkInTime!, 'hh:mm a')}</p>
                                </div>
                              ) : (
                                <span className="text-slate-300">Pending</span>
                              )}
                            </td>
                            <td className="px-6 py-5 text-right">
                               <button 
                                 onClick={(e) => { e.stopPropagation(); setShowOverrideModal({ userId: worker.uid, date: todayStr }); }}
                                 className="opacity-0 group-hover:opacity-100 p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all border border-indigo-100"
                               >
                                 <Edit2 size={16} />
                               </button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                   {workers.map(worker => (
                     <div key={worker.uid} className="bg-slate-50 border border-slate-200 rounded-[2rem] p-6 space-y-4">
                        <div className="flex items-center gap-3">
                           <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-lg text-indigo-600">
                             {worker.name.substring(0, 1).toUpperCase()}
                           </div>
                           <h4 className="font-black text-slate-800 uppercase tracking-tight">{worker.name}</h4>
                        </div>
                        <div className="space-y-2">
                           <button 
                             onClick={() => setSelectedWorkerHistory(worker)}
                             className="w-full py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                           >
                             <Calendar size={14} /> View Member History
                           </button>
                        </div>
                     </div>
                   ))}
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
                <p className="text-xs text-slate-500 font-medium px-8 leading-relaxed">Give this code to new workers during the registration process to link them to your group.</p>
              </div>

              {/* Permanent QR Code */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm text-center space-y-6">
                <div className="space-y-1">
                   <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Site Verification QR</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Permanent Code • Never Expires</p>
                </div>
                
                <div className="bg-white p-6 rounded-3xl border-8 border-slate-100 inline-block shadow-inner">
                  <QRCodeSVG value={user?.companyCode || ''} size={220} level="H" />
                </div>

                <div className="pt-4 flex flex-col gap-3">
                   <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all flex items-center justify-center gap-2">
                      <Download size={16} /> Screenshot for Printing
                   </button>
                   <p className="text-[10px] text-slate-400 font-bold px-12 italic">Workers can scan this QR using the "Scan QR" button in their interface to verify on-site presence.</p>
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
                <div className="p-8 border-b border-slate-100">
                   <h3 className="text-xl font-black text-slate-900 uppercase">Support Center</h3>
                   <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Worker Explanations & Notes</p>
                </div>
                
                <div className="divide-y divide-slate-100">
                  {messages.length === 0 ? (
                    <div className="p-20 text-center text-slate-400 italic">No incoming reports yet.</div>
                  ) : (
                    messages.map((m) => {
                      const sender = workers.find(w => w.uid === m.senderId);
                      return (
                        <div key={m.id} className="p-6 hover:bg-slate-50 transition-all flex gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black">
                              {sender?.name.substring(0, 1).toUpperCase()}
                           </div>
                           <div className="flex-1 space-y-2">
                              <div className="flex justify-between items-start">
                                 <h4 className="font-black text-slate-800 uppercase text-xs tracking-tight">{sender?.name}</h4>
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
      </nav>

      {/* Worker History Modal */}
      {selectedWorkerHistory && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl">
                    {selectedWorkerHistory.name.substring(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{selectedWorkerHistory.name}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Worker Full History</p>
                  </div>
               </div>
               <div className="flex gap-2">
                 <button 
                   onClick={() => exportWorkerReport(selectedWorkerHistory, workerAttendance)}
                   disabled={isGeneratingPdf}
                   className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all"
                   title="Download Worker PDF"
                 >
                   <Download size={20} />
                 </button>
                 <button onClick={() => setSelectedWorkerHistory(null)} className="p-3 bg-slate-100 text-slate-400 hover:text-slate-900 rounded-xl transition-all"><XCircle size={24} /></button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
               <div className="grid grid-cols-1 gap-4">
                  {workerAttendance.length === 0 ? (
                    <div className="text-center py-20 text-slate-400 italic">No attendance records found for this worker.</div>
                  ) : (
                    workerAttendance.map(record => (
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
                              onClick={() => setShowOverrideModal({ userId: selectedWorkerHistory.uid, date: record.date })}
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
    </div>
  );
}
