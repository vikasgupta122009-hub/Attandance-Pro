import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Button } from './components/ui/Button';
import { LogIn, UserCircle, Briefcase, PlusCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc, query, collection, where, getDocs, getDoc } from 'firebase/firestore';
import { firestore } from './lib/firebase';
import { WorkerDashboard } from './components/WorkerDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { UserRole } from './types';

export default function App() {
  const { user, firebaseUser, loading, signIn, logout, updateUser } = useAuth();
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

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

  if (!user) {
    // Signup Flow: Choose Role
    const handleSignup = async () => {
      if (!roleSelection || !userName) return;
      setIsSubmitting(true);
      console.log('Signup started', { roleSelection, userName, companyCodeInput });
      try {
        let companyCode = companyCodeInput.trim().toUpperCase();
        
        if (roleSelection === 'admin') {
          // Generate new company code if admin
          companyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          console.log('Creating admin account with company:', companyCode);
          await setDoc(doc(firestore, 'companies', companyCode), {
            code: companyCode,
            adminId: firebaseUser.uid,
            name: companyName || `${userName}'s Group`,
            createdAt: Date.now()
          });
        } else {
          // Verify company code if worker
          console.log('Verifying company code:', companyCode);
          if (!companyCode) {
            alert('Please enter a company code');
            setIsSubmitting(false);
            return;
          }
          const companySnap = await getDoc(doc(firestore, 'companies', companyCode));
          if (!companySnap.exists()) {
            alert('Invalid Company Code. Please ask your Admin for the code.');
            setIsSubmitting(false);
            return;
          }
          console.log('Company verified:', companySnap.data().name);
        }

        console.log('Updating user profile...');
        await updateUser({
          uid: firebaseUser.uid,
          name: userName,
          email: firebaseUser.email,
          role: roleSelection,
          companyCode: companyCode,
          createdAt: Date.now(),
        });
        console.log('User profile updated successfully');
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
                  <span className="font-black uppercase tracking-tight text-xs">Worker</span>
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
      {user.role === 'admin' ? <AdminDashboard /> : <WorkerDashboard />}
    </div>
  );
}
