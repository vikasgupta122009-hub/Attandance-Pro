import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, firestore } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot, orderBy, limit, addDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { MapPin, QrCode, Send, Calendar, CheckCircle, XCircle, AlertCircle, LogOut, Users, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRScanner } from './QRScanner';
import { Attendance, AttendanceStatus, Message, User } from '../types';
import { handleFirestoreError, OperationType } from '../lib/utils';

export function WorkerDashboard() {
  const { user, logout } = useAuth();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'calendar' | 'messages' | 'team'>('status');
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [teamAttendance, setTeamAttendance] = useState<Attendance[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (!user) return;

    // Listen for current month attendance
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const q = query(
      collection(firestore, 'attendance'),
      where('userId', '==', user.uid),
      where('date', '>=', monthStart)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => d.data() as Attendance);
      setAttendance(docs);
      const today = docs.find(d => d.date === todayStr);
      setTodayRecord(today || null);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'attendance');
    });

    // Listen for team members
    const qTeam = query(
      collection(firestore, 'users'),
      where('companyCode', '==', user.companyCode),
      where('role', '==', 'worker')
    );
    const unsubTeam = onSnapshot(qTeam, (snap) => {
      setTeamMembers(snap.docs.map(d => d.data() as User));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    // Listen for team attendance today - secure query by companyCode
    const qTeamAttendance = query(
      collection(firestore, 'attendance'),
      where('companyCode', '==', user.companyCode),
      where('date', '==', todayStr)
    );
    const unsubTeamAttendance = onSnapshot(qTeamAttendance, (snap) => {
      setTeamAttendance(snap.docs.map(d => d.data() as Attendance));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'attendance');
    });

    // Listen for messages received by the worker
    const qMessages = query(
      collection(firestore, 'messages'),
      where('receiverId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubMessages = onSnapshot(qMessages, (snap) => {
      setMessages(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Message));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'messages');
    });

    return () => {
      unsubscribe();
      unsubTeam();
      unsubTeamAttendance();
      unsubMessages();
    };
  }, [user, todayStr]);

  const markAttendance = async (method: 'button' | 'qr') => {
    if (!user || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Get GPS
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
      });

      const attendanceId = `${user.uid}_${todayStr}`;
      const record: Attendance = {
        id: attendanceId,
        userId: user.uid,
        companyCode: user.companyCode!,
        date: todayStr,
        status: 'present',
        checkInTime: Date.now(),
        method,
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        },
        modifiedByAdmin: false,
        updatedAt: Date.now()
      };

      await setDoc(doc(firestore, 'attendance', attendanceId), record);
      setIsScanning(false);
    } catch (err: any) {
      if (err.message && err.message.includes('authInfo')) {
        // Already handled by handleFirestoreError if it came from there
      } else {
        handleFirestoreError(err, OperationType.WRITE, `attendance/${user.uid}_${todayStr}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!user || !message.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Find admin
      const companyQuery = query(collection(firestore, 'companies'), where('code', '==', user.companyCode));
      const companySnap = await getDocs(companyQuery);
      if (companySnap.empty) return;
      const adminId = companySnap.docs[0].data().adminId;

      await addDoc(collection(firestore, 'messages'), {
        senderId: user.uid,
        senderName: user.name,
        receiverId: adminId,
        companyCode: user.companyCode,
        content: message.trim(),
        createdAt: Date.now(),
        read: false
      });
      setMessage('');
      alert('Message sent to Admin!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const calendarDays = eachDayOfInterval({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  });

  return (
    <div className="bg-slate-100 min-h-screen py-8 px-4 flex items-center justify-center font-sans">
      <div className="w-full max-w-sm bg-slate-900 rounded-[3rem] p-4 border-[8px] border-slate-800 shadow-2xl relative overflow-hidden flex flex-col h-[780px]">
        {/* Status Hub / Header */}
        <div className="flex justify-between items-center text-white mb-6 px-4 pt-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Portal Access</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="font-bold text-sm truncate max-w-[120px]">{user?.name}</span>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-xl hover:bg-rose-500/20 transition-all group">
            <LogOut size={16} />
            <span className="text-[8px] font-black uppercase tracking-widest hidden group-hover:block">Switch</span>
          </button>
        </div>

        {/* Status Card - Modern Indicator */}
        <div className="px-3 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Live Attendance Status</p>
              <h2 className={`text-sm font-black uppercase tracking-tight ${todayRecord ? 'text-emerald-400' : 'text-rose-400'}`}>
                {todayRecord ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle size={14} /> Marked Present
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <AlertCircle size={14} /> Not Marked
                  </span>
                )}
              </h2>
            </div>
            {todayRecord && (
              <div className="text-right">
                <p className="text-[14px] font-black text-white">{format(todayRecord.checkInTime!, 'hh:mm')}</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{format(todayRecord.checkInTime!, 'aa')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] flex-1 flex flex-col overflow-hidden relative shadow-inner">
          <main className="flex-1 overflow-y-auto p-5 space-y-6 pb-24">
            <AnimatePresence mode="wait">
              {activeTab === 'status' && (
                <motion.div
                  key="status"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Presence Hub - Giant Action Buttons */}
                  <div className="grid grid-cols-1 gap-4">
                    {!todayRecord ? (
                      <>
                        <button
                          onClick={() => markAttendance('button')}
                          disabled={isSubmitting}
                          className="w-full h-44 bg-emerald-500 text-white rounded-[2rem] shadow-xl shadow-emerald-100 flex flex-col items-center justify-center gap-4 hover:bg-emerald-600 active:scale-[0.98] transition-all disabled:opacity-50 group overflow-hidden relative"
                        >
                          <div className="absolute top-0 right-0 p-4 opacity-10">
                            <CheckCircle size={120} />
                          </div>
                          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner">
                            <CheckCircle size={32} />
                          </div>
                          <div className="text-center group-active:translate-y-1 transition-transform">
                            <span className="text-2xl font-black uppercase tracking-tighter block leading-none">I'M PRESENT</span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-70">Capture GPS & Time</span>
                          </div>
                        </button>

                        <button
                          onClick={() => setIsScanning(true)}
                          disabled={isSubmitting}
                          className="w-full h-44 bg-indigo-600 text-white rounded-[2rem] shadow-xl shadow-indigo-100 flex flex-col items-center justify-center gap-4 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 group overflow-hidden relative"
                        >
                          <div className="absolute top-0 right-0 p-4 opacity-10">
                            <QrCode size={120} />
                          </div>
                          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner">
                            <QrCode size={32} />
                          </div>
                          <div className="text-center group-active:translate-y-1 transition-transform">
                            <span className="text-2xl font-black uppercase tracking-tighter block leading-none">SCAN QR</span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-70">Verify at Site</span>
                          </div>
                        </button>
                      </>
                    ) : (
                      <div className="p-8 text-center bg-emerald-50 rounded-[2.5rem] border-2 border-emerald-100 space-y-4">
                         <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-100">
                           <CheckCircle size={40} />
                         </div>
                         <div className="space-y-1">
                           <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Entry Recorded</h3>
                           <p className="text-xs text-slate-500 font-medium">Successfully verified at <span className="text-emerald-600 font-black">{format(todayRecord.checkInTime!, 'hh:mm a')}</span></p>
                         </div>
                         <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-emerald-100 text-[10px] font-black text-emerald-700 uppercase tracking-widest shadow-sm">
                           <MapPin size={12} />
                           Location Stamped
                         </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Chat Entry */}
                  <div className="p-1">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                       <Send size={12} /> Explain Issues / Late Arrival
                    </h4>
                    <div className="relative group">
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type a quick note to Admin..."
                        className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 text-sm h-28 resize-none transition-all"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!message.trim() || isSubmitting}
                        className="absolute bottom-3 right-3 p-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-30 disabled:translate-y-1 transition-all active:scale-90"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'calendar' && (
                <motion.div
                  key="calendar"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex justify-between items-center px-1">
                    <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight">{format(new Date(), 'MMMM')} History</h3>
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><Calendar size={14} className="text-slate-400" /></div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-[2rem] border-2 border-slate-100 shadow-sm">
                    <div className="grid grid-cols-7 gap-2">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                        <div key={i} className="text-center text-[10px] font-black text-slate-400 pb-2">{day}</div>
                      ))}
                      {calendarDays.map((day) => {
                        const record = attendance.find(a => a.date === format(day, 'yyyy-MM-dd'));
                        const isToday = isSameDay(day, new Date());
                        const isFuture = day > new Date();
                        
                        let bgColor = 'bg-slate-200';
                        let textColor = 'text-slate-400';
                        
                        if (record) {
                          if (record.status === 'present') {
                            bgColor = 'bg-emerald-500';
                            textColor = 'text-white';
                          } else {
                            bgColor = 'bg-rose-500';
                            textColor = 'text-white';
                          }
                        } else if (!isFuture && !isToday) {
                          bgColor = 'bg-rose-50 text-rose-200';
                        }

                        return (
                          <div
                            key={day.toString()}
                            className={`aspect-square rounded-xl flex flex-col items-center justify-center text-[10px] font-black relative transition-all ${bgColor} ${textColor} ${isToday ? 'ring-[3px] ring-indigo-500 ring-offset-2' : ''} ${record?.modifiedByAdmin ? 'ring-2 ring-amber-400' : ''}`}
                          >
                            {format(day, 'd')}
                            {record?.modifiedByAdmin && (
                              <div className="absolute -top-1 -right-1 p-0.5 bg-amber-400 text-slate-900 rounded-full shadow-sm">
                                <Edit2 size={6} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="p-5 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-4">
                    <div className="bg-amber-100 p-2 rounded-lg text-amber-600"><AlertCircle size={20} /></div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Admin Correction Badge</p>
                      <p className="text-[9px] font-medium text-amber-700 leading-relaxed">Days highlighted with a yellow ring indicate the admin manually adjusted your status.</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'team' && (
                <motion.div
                  key="team"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight px-1">My Site Team</h3>
                  <div className="grid grid-cols-1 gap-2.5">
                    {teamMembers.length === 0 ? (
                      <div className="text-center p-12 bg-slate-50 rounded-2xl italic text-slate-400 text-sm">Waiting for teammates...</div>
                    ) : (
                      teamMembers.map(member => {
                        const isPresent = teamAttendance.some(a => a.userId === member.uid);
                        return (
                          <div key={member.uid} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm hover:translate-x-1 transition-transform">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs ${
                                member.uid === user?.uid ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {member.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-[12px] font-black text-slate-800 leading-none">{member.name} {member.uid === user?.uid && '(You)'}</p>
                                <p className={`text-[10px] font-bold uppercase tracking-tight mt-1 ${isPresent ? 'text-emerald-500' : 'text-slate-300'}`}>
                                  {isPresent ? 'Currently Present' : 'Pending Check-in'}
                                </p>
                              </div>
                            </div>
                            {isPresent && (
                              <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center animate-pulse">
                                <CheckCircle size={18} />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'messages' && (
                 <motion.div
                   key="messages"
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -10 }}
                   className="space-y-4"
                 >
                   <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight px-1">Support Inbox</h3>
                   <div className="space-y-3">
                     {messages.length === 0 ? (
                       <div className="text-center p-12 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] italic bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100">
                          No replies from admin yet
                       </div>
                     ) : (
                       messages.map(m => (
                         <div key={m.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                           <div className="flex justify-between items-center">
                             <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">From: Admin</span>
                             <span className="text-[8px] text-slate-400 font-bold">{format(m.createdAt, 'MMM d, hh:mm a')}</span>
                           </div>
                           <p className="text-sm text-slate-700 font-medium italic">"{m.content}"</p>
                         </div>
                       ))
                     )}
                   </div>
                 </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Bottom Nav - Floating High Contact */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
            <nav className="bg-slate-900/95 backdrop-blur-lg rounded-2xl flex justify-around p-3 shadow-2xl border border-white/10">
              <button 
                onClick={() => setActiveTab('status')} 
                className={`flex-1 p-2 flex flex-col items-center gap-1 transition-all ${activeTab === 'status' ? 'text-emerald-400 scale-110' : 'text-slate-500'}`}
              >
                <CheckCircle size={20} className={activeTab === 'status' ? 'fill-emerald-400/20' : ''} />
                <span className="text-[7px] font-black uppercase tracking-widest">Home</span>
              </button>
              <button 
                onClick={() => setActiveTab('team')} 
                className={`flex-1 p-2 flex flex-col items-center gap-1 transition-all ${activeTab === 'team' ? 'text-indigo-400 scale-110' : 'text-slate-500'}`}
              >
                <Users size={20} className={activeTab === 'team' ? 'fill-indigo-400/20' : ''} />
                <span className="text-[7px] font-black uppercase tracking-widest">Team</span>
              </button>
              <button 
                onClick={() => setActiveTab('calendar')} 
                className={`flex-1 p-2 flex flex-col items-center gap-1 transition-all ${activeTab === 'calendar' ? 'text-indigo-400 scale-110' : 'text-slate-500'}`}
              >
                <Calendar size={20} className={activeTab === 'calendar' ? 'fill-indigo-400/20' : ''} />
                <span className="text-[7px] font-black uppercase tracking-widest">Records</span>
              </button>
              <button 
                onClick={() => setActiveTab('messages')} 
                className={`flex-1 p-2 flex flex-col items-center gap-1 transition-all ${activeTab === 'messages' ? 'text-indigo-400 scale-110' : 'text-slate-500'}`}
              >
                <Send size={20} className={activeTab === 'messages' ? 'fill-indigo-400/20' : ''} />
                <span className="text-[7px] font-black uppercase tracking-widest">Support</span>
              </button>
            </nav>
          </div>
        </div>
      </div>


      {/* QR Scanner Modal */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-6"
          >
            <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Scan Admin QR</h3>
                <button onClick={() => setIsScanning(false)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                  <XCircle size={24} />
                </button>
              </div>
              <QRScanner
                onScan={(code) => {
                  if (code === user?.companyCode) {
                    markAttendance('qr');
                  } else {
                    alert('Invalid Team QR Code!');
                  }
                }}
              />
              <p className="text-center text-slate-400 text-xs font-medium italic">Align the QR code within the frame</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
