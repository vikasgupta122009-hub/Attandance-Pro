import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Button } from './components/ui/Button';
import { LogIn, UserCircle, Briefcase, PlusCircle, CheckCircle, Shield, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc, query, collection, where, getDocs, getDoc, writeBatch } from 'firebase/firestore';
import { firestore } from './lib/firebase';
import { MemberDashboard } from './components/MemberDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { UserRole } from './types';
import { handleFirestoreError, OperationType } from './lib/utils';

export default function App() {
  const { user, firebaseUser, loading, signIn, logout, updateUser, memberships, switchWorkspace } = useAuth();
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState('');

  React.useEffect(() => {
    if (firebaseUser?.displayName && !userName) {
      setUserName(firebaseUser.displayName);
    }
  }, [firebaseUser]);
  const [companyCodeInput, setCompanyCodeInput] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!firebaseUser) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-900 overflow-hidden">
        {/* Modern Secure Portal Aesthetic */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
          
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm"
          >
            <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border-b-[8px] border-indigo-600 transition-all">
              <div className="mb-10 flex flex-col items-center">
                <div className="w-20 h-20 bg-indigo-50 border-4 border-indigo-100 rounded-2xl flex items-center justify-center mb-6 shadow-indigo-100 shadow-xl">
                  <CheckCircle size={40} className="text-indigo-600" />
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic">ATTENDLY</h1>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] mt-2">GPS Verification</p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={signIn}
                  className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 py-4 px-6 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-50 active:scale-95 transition-all shadow-xl shadow-indigo-500/20 border-2 border-slate-100"
                >
                  <LogIn size={18} className="text-indigo-600" />
                  Sign in with Google
                </button>
                <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Secure OAuth 2.0 Integration
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4 px-4 opacity-50 grayscale pointer-events-none">
               <div className="h-1 bg-white/20 rounded-full"></div>
               <div className="h-1 bg-white/20 rounded-full"></div>
               <div className="h-1 bg-white/20 rounded-full"></div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // If user profile is not complete or no active workspace is selected
  if (!user || !user.companyId) {
    // If user has memberships but no active workspace set in the main user doc
    if (memberships.length > 0) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl">
            <div className="w-20 h-20 bg-indigo-50 border-4 border-indigo-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Shield size={40} className="text-indigo-600" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic mb-4">Select Directory</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-8">You have multiple active roles</p>
            
            <div className="space-y-3 mb-8">
              {memberships.map(m => (
                <button
                  key={m.companyId}
                  onClick={() => switchWorkspace(m.companyId, m.companyCode, m.companyName, m.role)}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-slate-100 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black">
                      {m.companyName[0]}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-slate-800 uppercase truncate max-w-[150px]">{m.companyName}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.role}</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>

            <button 
              onClick={() => logout()}
              className="w-full py-4 text-rose-500 font-black uppercase text-[10px] tracking-widest hover:bg-rose-50 rounded-2xl transition-all"
            >
              Sign out / Change Account
            </button>
          </div>
        </div>
      );
    }

    // Signup Flow: Choose Role
    const handleSignup = async () => {
      if (!roleSelection || !userName || !firebaseUser) return;
      setIsSubmitting(true);
      
      const batch = writeBatch(firestore);
      const currentTimestamp = Date.now();
      const userId = firebaseUser.uid;

      try {
        let companyCode = companyCodeInput.trim().toUpperCase();
        let companyId = '';
        let groupName = '';
        
        if (roleSelection === 'admin') {
          companyId = doc(collection(firestore, 'companies')).id;
          companyCode = companyCode || Math.random().toString(36).substring(2, 8).toUpperCase();
          if (companyCode.length > 6) companyCode = companyCode.substring(0, 6);
          while (companyCode.length < 6) companyCode += 'X';
          groupName = companyName || `${userName}'s Group`;

          batch.set(doc(firestore, 'companies', companyId), {
            id: companyId,
            code: companyCode,
            adminId: userId,
            name: groupName,
            createdAt: currentTimestamp
          });
        } else {
          // Verify company code if member
          console.log('Verifying company code:', companyCode);
          if (!companyCode) {
            alert('Please enter a company code');
            setIsSubmitting(false);
            return;
          }
          const companyQuery = query(collection(firestore, 'companies'), where('code', '==', companyCode));
          let companySnap;
          try {
            companySnap = await getDocs(companyQuery);
          } catch (e) {
            handleFirestoreError(e, OperationType.LIST, 'companies');
          }
          
          if (!companySnap || companySnap.empty) {
            alert('Invalid Company Code. Please ask your Admin for the code.');
            setIsSubmitting(false);
            return;
          }
          
          const companyDoc = companySnap.docs[0];
          companyId = companyDoc.id;
          groupName = (companyDoc.data() as any).name;
        }

        // 1. Create/Update User Profile
        const userPayload = {
          uid: userId,
          name: userName,
          email: firebaseUser.email,
          role: roleSelection,
          companyId: companyId,
          companyCode: companyCode,
          companyName: groupName,
          activeWorkspace: companyId,
          createdAt: currentTimestamp,
          updatedAt: currentTimestamp
        };
        batch.set(doc(firestore, 'users', userId), userPayload);

        // 2. Create Membership
        const membershipPayload = {
          companyId: companyId,
          companyCode: companyCode,
          companyName: groupName,
          role: roleSelection,
          joinedAt: currentTimestamp
        };
        batch.set(doc(firestore, 'users', userId, 'memberships', companyId), membershipPayload);

        await batch.commit();
        console.log('Signup batch committed successfully');
      } catch (err: any) {
        console.error('Signup error:', err);
        alert(`Failed to signup: ${err.message || 'Unknown error'}`);
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col p-4 md:p-8">
        <div className="max-w-md w-full mx-auto space-y-6">
          <header className="text-center mb-6 pt-8">
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter leading-none mb-2">COMPLETE PROFILE</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Define your organizational role</p>
          </header>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200 space-y-6">
            <div className="space-y-4">
              <label className="block">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Full Name</span>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Official Name"
                  className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setRoleSelection('worker')}
                  className={`p-6 rounded-2xl border-4 flex flex-col items-center gap-3 transition-all ${
                    roleSelection === 'worker' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-lg shadow-indigo-100' : 'border-slate-50 bg-slate-50 text-slate-400 opacity-60'
                  }`}
                >
                  <UserCircle size={32} />
                  <span className="font-black uppercase tracking-tight text-xs">Member</span>
                </button>
                <button
                  onClick={() => setRoleSelection('admin')}
                  className={`p-6 rounded-2xl border-4 flex flex-col items-center gap-3 transition-all ${
                    roleSelection === 'admin' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-lg shadow-indigo-100' : 'border-slate-50 bg-slate-50 text-slate-400 opacity-60'
                  }`}
                >
                  <Briefcase size={32} />
                  <span className="font-black uppercase tracking-tight text-xs">Admin</span>
                </button>
              </div>

              <AnimatePresence mode="wait">
                {roleSelection === 'worker' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <label className="block pt-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Company Access Code</span>
                      <input
                        type="text"
                        value={companyCodeInput}
                        onChange={(e) => setCompanyCodeInput(e.target.value)}
                        placeholder="XXXXXX"
                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-black text-slate-800 tracking-widest text-center"
                      />
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-3 text-center">Refer to your Administrator for credentials</p>
                    </label>
                  </motion.div>
                )}

                {roleSelection === 'admin' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <label className="block pt-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Organization Name</span>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Business Entity Name"
                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                      />
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                disabled={!roleSelection || !userName || isSubmitting}
                onClick={handleSignup}
                className="w-full py-5 px-6 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black active:scale-95 transition-all mt-4 shadow-xl shadow-slate-200"
              >
                {isSubmitting ? 'Establishing Account...' : 'Continue to Dashboard'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loaded Dashboard
  return (
    <div className="min-h-screen bg-gray-50">
      {user.role === 'admin' ? <AdminDashboard /> : <MemberDashboard />}
    </div>
  );
}
