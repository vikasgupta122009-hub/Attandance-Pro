import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { firestore } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, getDoc, runTransaction } from 'firebase/firestore';
import { Membership, User, UserRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, LogOut, Plus, ChevronRight, X, UserPlus, AlertTriangle, Shield, Briefcase, Trash2 } from 'lucide-react';

interface WorkspaceSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({ isOpen, onClose }) => {
  const { user, memberships, switchWorkspace, firebaseUser } = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState<{ companyId: string } | null>(null);
  const [potentialSuccessors, setPotentialSuccessors] = useState<User[]>([]);

  const [companyName, setCompanyName] = useState('');
  const [activeTab, setActiveTab ] = useState<'join' | 'create'>('join');
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const handleCreateCompany = async () => {
    if (!firebaseUser || !companyName) return;
    setIsSubmitting(true);
    try {
      const companyId = doc(collection(firestore, 'companies')).id;
      const companyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // 1. Create Company doc
      await setDoc(doc(firestore, 'companies', companyId), {
        id: companyId,
        code: companyCode,
        name: companyName,
        adminId: firebaseUser.uid,
        createdAt: Date.now()
      });

      // 2. Add to memberships
      const membershipRef = doc(firestore, 'users', firebaseUser.uid, 'memberships', companyId);
      await setDoc(membershipRef, {
        companyId: companyId,
        companyCode: companyCode,
        companyName: companyName,
        role: 'admin',
        joinedAt: Date.now()
      });

      setCompanyName('');
      setIsAdding(false);
      alert(`Company ${companyName} created! Group Code: ${companyCode}`);
      
      // Auto-switch to newly created company
      await switchWorkspace(companyId, companyCode, companyName, 'admin');
    } catch (err) {
      console.error(err);
      alert('Error creating company');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinCompany = async () => {
    if (!firebaseUser || !newCode) return;
    setIsSubmitting(true);
    try {
      const companyCode = newCode.trim().toUpperCase();
      const companyQuery = query(collection(firestore, 'companies'), where('code', '==', companyCode));
      const companySnap = await getDocs(companyQuery);
      
      if (companySnap.empty) {
        alert('Invalid Company Code');
        return;
      }
      
      const companyDoc = companySnap.docs[0];
      const companyId = companyDoc.id;
      const companyData = companyDoc.data() as any;

      // Create membership
      const membershipRef = doc(firestore, 'users', firebaseUser.uid, 'memberships', companyId);
      await setDoc(membershipRef, {
        companyId: companyId,
        companyCode: companyCode,
        companyName: companyData.name,
        role: 'worker', // Joining as worker by default
        joinedAt: Date.now()
      });

      setNewCode('');
      setIsAdding(false);
      alert(`Successfully joined ${companyData.name}`);
      await switchWorkspace(companyId, companyCode, companyData.name, 'worker');
    } catch (err) {
      console.error(err);
      alert('Error joining company');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeaveWorkspace = async (companyId: string, role: UserRole) => {
    if (!firebaseUser) return;

    if (role === 'admin') {
      const companySnap = await getDoc(doc(firestore, 'companies', companyId));
      if (companySnap.exists() && companySnap.data().adminId === firebaseUser.uid) {
        // Must promote someone else or delete company
        const membersSnap = await getDocs(query(collection(firestore, 'users'), where('companyId', '==', companyId)));
        const others = membersSnap.docs
          .map(d => d.data() as User)
          .filter(u => u.uid !== firebaseUser.uid);

        if (others.length > 0) {
          setPotentialSuccessors(others);
          setShowPromoteModal({ companyId: companyId });
          return;
        } else {
          // Mandatory check: if only admin, they must dissolve using the settings tab
          alert('SECURITY CHECK: You are the last member. To leave, you must either promote a successor or permanently Dissolve the Group via Organization Settings in the Dashboard.');
          return;
        }
      }
    }

    // Replace window.confirm with a simple conditional for now, 
    // but in a more complex app we'd use a dedicated state-based modal.
    const confirmed = true; // Forcing true in prototype environment if confirm is blocked
    
    if (confirmed) {
      await deleteDoc(doc(firestore, 'users', firebaseUser.uid, 'memberships', companyId));
      
      // If it was the active workspace, switch to another if available
      if (user?.companyId === companyId) {
        const remaining = memberships.filter(m => m.companyId !== companyId);
        if (remaining.length > 0) {
          await switchWorkspace(remaining[0].companyId, remaining[0].companyCode, remaining[0].companyName, remaining[0].role);
        } else {
          window.location.reload();
        }
      }
    }
  };

  const promoteAndLeave = async (newAdminId: string) => {
    if (!showPromoteModal || !firebaseUser) return;
    const companyId = showPromoteModal.companyId;

    try {
      await runTransaction(firestore, async (transaction) => {
        const companyRef = doc(firestore, 'companies', companyId);
        const newAdminMembershipRef = doc(firestore, 'users', newAdminId, 'memberships', companyId);
        const currentUserMembershipRef = doc(firestore, 'users', firebaseUser.uid, 'memberships', companyId);
        const newAdminDocRef = doc(firestore, 'users', newAdminId);
        const currentUserDocRef = doc(firestore, 'users', firebaseUser.uid);

        // 1. READS:
        const newAdminSnap = await transaction.get(newAdminDocRef);
        
        // 2. WRITES:
        // Update Company document primary admin
        transaction.update(companyRef, { adminId: newAdminId });

        // Update new admin's membership role to 'admin'
        transaction.update(newAdminMembershipRef, { role: 'admin' });

        // Update new admin's global role if this is their active workspace
        if (newAdminSnap.exists()) {
          const newAdminData = newAdminSnap.data();
          if (newAdminData?.activeWorkspace === companyId) {
            transaction.update(newAdminDocRef, { role: 'admin' });
          }
        }

        // Delete the leaving admin's membership
        transaction.delete(currentUserMembershipRef);

        // Clear current user's global context if leaving
        transaction.update(currentUserDocRef, {
          companyId: '',
          companyCode: '',
          companyName: '',
          role: 'worker',
          activeWorkspace: '',
          updatedAt: Date.now()
        });
      });

      setShowPromoteModal(null);
      alert('Succession Complete: Admin rights transferred and workspace left successfully.');
      
      // Force workspace switch or reload
      if (user?.companyId === companyId) {
        const remaining = memberships.filter(m => m.companyId !== companyId);
        if (remaining.length > 0) {
          await switchWorkspace(remaining[0].companyId, remaining[0].companyCode, remaining[0].companyName, remaining[0].role);
        } else {
          window.location.reload();
        }
      }
    } catch (err) {
      console.error('Succession error:', err);
      alert('Transaction Failed: Could not transfer admin rights. Please try again.');
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (!firebaseUser) return;
    
    // In a production environment, you would use a state-based modal.
    // For this switcher, we'll implement a simple double-click or confirmation state if possible,
    // but the Admin Dashboard Settings is now the preferred way to dissolve.
    // However, to keep it functional, let's at least mention the Admin Dashboard.
    
    if (confirm("Permanently dissolve organization? Use the 'Organization Settings' tab in the Admin Dashboard for a secure handover or dissolution.")) {
      try {
        setIsSubmitting(true);
        await deleteDoc(doc(firestore, 'companies', companyId));
        await deleteDoc(doc(firestore, 'users', firebaseUser.uid, 'memberships', companyId));
        alert('Organization dissolved successfully.');
        if (user?.companyId === companyId) {
          window.location.reload();
        }
      } catch (err) {
        console.error(err);
        alert('Failed to dissolve organization');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-slate-900 z-[101] shadow-2xl flex flex-col border-l border-white/10"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-800/50">
              <div>
                <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Workspaces</h2>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">Multi-Directory Switcher</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {memberships.map((m) => (
                <div
                  key={m.companyId}
                  className={`group relative p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                    user?.companyId === m.companyId 
                      ? 'bg-indigo-600/10 border-indigo-500/50 shadow-lg shadow-indigo-500/5' 
                      : 'bg-white/5 border-transparent hover:bg-white/10'
                  } ${switchingTo === m.companyId ? 'animate-pulse' : ''}`}
                  onClick={async () => {
                    if (user?.companyId !== m.companyId && !switchingTo) {
                      setSwitchingTo(m.companyId);
                      try {
                        await switchWorkspace(m.companyId, m.companyCode, m.companyName, m.role);
                      } finally {
                        setSwitchingTo(null);
                      }
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${
                      user?.companyId === m.companyId ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                    }`}>
                      {switchingTo === m.companyId ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        m.companyName[0]
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-bold text-sm truncate uppercase tracking-tight">
                        {switchingTo === m.companyId ? 'Switching...' : m.companyName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          m.role === 'admin' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {m.role}
                        </span>
                        <span className="text-[8px] text-white/30 font-mono uppercase">{m.companyCode}</span>
                      </div>
                    </div>
                    {user?.companyId === m.companyId && (
                       <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                    )}
                  </div>

                    {m.role === 'admin' && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCompany(m.companyId);
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-rose-500 text-white/30 mr-1"
                        title="Delete Organization"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLeaveWorkspace(m.companyId, m.role);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-orange-400 text-white/30"
                      title="Leave Workspace"
                    >
                      <LogOut size={14} />
                    </button>
                  </div>
              ))}

              <button
                onClick={() => setIsAdding(true)}
                className="w-full p-4 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center gap-3 text-white/40 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
              >
                <Plus size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">Connect New Group</span>
              </button>
            </div>

            <div className="p-6 bg-slate-950/50 border-t border-white/5">
               <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest text-center italic">switching workspaces clears session data securely</p>
            </div>
          </motion.div>

          {/* Add Workspace Modal */}
          <AnimatePresence>
            {isAdding && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsAdding(false)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-md"
                />
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-6">
                    <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                      <X size={24} />
                    </button>
                  </div>

                  <div className="mb-8">
                    <div className="w-16 h-16 bg-indigo-50 border-4 border-indigo-100 rounded-2xl flex items-center justify-center mb-4">
                      {activeTab === 'join' ? <Plus size={32} className="text-indigo-600" /> : <Briefcase size={32} className="text-indigo-600" />}
                    </div>
                    <div className="flex gap-4 items-end">
                      <button 
                        onClick={() => setActiveTab('join')}
                        className={`text-2xl font-black tracking-tighter italic uppercase ${activeTab === 'join' ? 'text-slate-900' : 'text-slate-300'}`}
                      >
                        JOIN
                      </button>
                      <span className="text-2xl font-black text-slate-200 italic">/</span>
                      <button 
                        onClick={() => setActiveTab('create')}
                        className={`text-2xl font-black tracking-tighter italic uppercase ${activeTab === 'create' ? 'text-slate-900' : 'text-slate-300'}`}
                      >
                        CREATE
                      </button>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                      {activeTab === 'join' ? 'Connect to existing directory' : 'Establish new organization'}
                    </p>
                  </div>

                  <div className="space-y-6">
                    {activeTab === 'join' ? (
                      <label className="block">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Company Code</span>
                        <input
                          type="text"
                          value={newCode}
                          onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                          placeholder="XXXXXX"
                          className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-indigo-100 outline-none font-black text-slate-900 tracking-widest text-center text-xl uppercase"
                        />
                      </label>
                    ) : (
                      <label className="block">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Company Name</span>
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="e.g. Acme Corp"
                          className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-900"
                        />
                      </label>
                    )}

                    <button
                      onClick={activeTab === 'join' ? handleJoinCompany : handleCreateCompany}
                      disabled={isSubmitting || (activeTab === 'join' ? !newCode : !companyName)}
                      className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black active:scale-95 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Processing...' : activeTab === 'join' ? 'Establish Link' : 'Initialize Directory'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Promote Successor Modal */}
          <AnimatePresence>
            {showPromoteModal && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-rose-950/90 backdrop-blur-xl"
                />
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  className="relative w-full max-w-md bg-white rounded-[3rem] p-8 shadow-[0_0_100px_rgba(225,29,72,0.3)]"
                >
                  <div className="mb-8 text-center">
                    <div className="w-20 h-20 bg-rose-50 border-4 border-rose-100 rounded-[2rem] flex items-center justify-center mb-6 mx-auto">
                      <Shield size={40} className="text-rose-600" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Admin Succession</h2>
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mt-2">Designate an heir before leaving</p>
                  </div>

                  <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-2xl mb-6 flex items-start gap-4">
                    <AlertTriangle className="text-rose-600 shrink-0" size={24} />
                    <p className="text-xs text-rose-900 font-medium leading-relaxed">
                      You are the primary Administrator for this organization.
                      The organization requires an Admin at all times. Please select a member to promote to Administrator.
                    </p>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {potentialSuccessors.map(member => (
                      <button
                        key={member.uid}
                        onClick={() => promoteAndLeave(member.uid)}
                        className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs uppercase">
                            {member.name[0]}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{member.name}</p>
                            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{member.email}</p>
                          </div>
                        </div>
                        <UserPlus size={16} className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setShowPromoteModal(null)}
                    className="w-full mt-8 py-4 border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-colors"
                  >
                    Cancel Action
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
};
