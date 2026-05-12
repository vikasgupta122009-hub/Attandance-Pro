import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { auth, firestore } from '../lib/firebase';
import { User, Membership, UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../lib/utils';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  memberships: Membership[];
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  switchWorkspace: (companyId: string, companyCode: string, companyName: string, role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubMemberships: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (fUser) => {
      try {
        setFirebaseUser(fUser);
        if (fUser) {
          // Listen to user document
          unsubUser = onSnapshot(doc(firestore, 'users', fUser.uid), async (document) => {
            if (document.exists()) {
              const userData = document.data() as User;
              
              // MIGRATION LAYER: Handle legacy users without companyId
              // Optimization: Only run if companyId is explicitly missing but companyCode exists
              if (userData.companyCode && !userData.companyId) {
                console.log('Migrating legacy user:', userData.email);
                const legacyId = userData.companyCode;
                
                try {
                  // 1. Update user profile
                  await setDoc(doc(firestore, 'users', fUser.uid), {
                    companyId: legacyId,
                    updatedAt: Date.now()
                  }, { merge: true });

                  // 2. Ensure company document has an id field (old companies might not)
                  const companyRef = doc(firestore, 'companies', legacyId);
                  const companySnap = await getDoc(companyRef);
                  if (companySnap.exists() && !companySnap.data().id) {
                    await setDoc(companyRef, { id: legacyId }, { merge: true });
                  }

                  // 3. Create initial membership
                  const membershipRef = doc(firestore, 'users', fUser.uid, 'memberships', legacyId);
                  const mSnap = await getDoc(membershipRef);
                  if (!mSnap.exists()) {
                    await setDoc(membershipRef, {
                      companyId: legacyId,
                      companyCode: legacyId,
                      companyName: (companySnap.exists() ? companySnap.data().name : null) || 'My Organization',
                      role: userData.role,
                      joinedAt: userData.createdAt || Date.now()
                    });
                  }
                } catch (migrationErr) {
                  console.error('Migration failed:', migrationErr);
                }
              }
              
              setUser(userData);
            } else {
              setUser(null);
            }
            setLoading(false);
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${fUser.uid}`);
            setLoading(false);
          });

          // Listen to memberships
          unsubMemberships = onSnapshot(collection(firestore, 'users', fUser.uid, 'memberships'), (snap) => {
            setMemberships(snap.docs.map(d => d.data() as Membership));
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, `users/${fUser.uid}/memberships`);
          });
        } else {
          if (unsubUser) unsubUser();
          if (unsubMemberships) unsubMemberships();
          setUser(null);
          setMemberships([]);
          setLoading(false);
        }
      } catch (err) {
        console.error('Auth check error:', err);
        setUser(null);
        setMemberships([]);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUser) unsubUser();
      if (unsubMemberships) unsubMemberships();
    };
  }, []);

  const [isSigningIn, setIsSigningIn] = useState(false);

  const signIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    
    console.log('SignIn triggered. Auth state:', auth.currentUser ? 'Logged in' : 'Logged out');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      console.log('Attempting signInWithPopup...');
      const result = await signInWithPopup(auth, provider);
      console.log('SignIn successful:', result.user.email);
    } catch (error: any) {
      console.error('Detailed Auth Error:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
        customData: error.customData
      });

      if (error.code === 'auth/popup-blocked') {
        alert('Blocked: Please allow popups for this site. If you see this error inside an AI Studio preview, try opening the app in a new tab using the button at the top right.');
      } else if (error.code === 'auth/unauthorized-domain') {
        alert('Error: This domain is not authorized in the Firebase Console. You need to add this domain to "Authentication > Settings > Authorized domains".');
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.log('User closed the popup');
      } else {
        alert(`Authentication Error (${error.code}): ${error.message}`);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const switchWorkspace = async (companyId: string, companyCode: string, companyName: string, role: UserRole) => {
    if (!firebaseUser) return;
    
    setLoading(true);
    try {
      // 1. Update active workspace in Firestore
      await setDoc(doc(firestore, 'users', firebaseUser.uid), {
        companyId: companyId,
        companyCode: companyCode,
        companyName: companyName,
        role: role,
        activeWorkspace: companyId, // Explicitly track active workspace
        updatedAt: Date.now()
      }, { merge: true });

      // 2. Clear relevant session caches but avoid full hard logout
      // We only clear application-level data, keeping Firebase Auth intact.
      Object.keys(window.localStorage).forEach(key => {
        if (!key.startsWith('firebase:')) {
          window.localStorage.removeItem(key);
        }
      });
      window.sessionStorage.clear();

      // 3. Update local state immediately to provide "Direct" feeling
      const updatedUser = { 
        ...user, 
        companyId, 
        companyCode, 
        companyName, 
        role, 
        activeWorkspace: companyId,
        updatedAt: Date.now() 
      } as User;
      setUser(updatedUser);

      // 4. Force a clean transition by navigating or just letting state propagate
      // We use replacement to avoid back-button loops, but only if necessary.
      // In many cases, the state update above + Firestore listener will suffice.
      // We use a small timeout to ensure Firestore has processed before any edge-case reloads.
      setTimeout(() => {
        setLoading(false);
        // Using path suffix to force remount of components if needed
        window.location.hash = `workspace_${companyId}_${Date.now()}`;
      }, 300);
      
    } catch (err) {
      console.error('Switch error:', err);
      alert('Failed to switch workspace. Identity conflict detected.');
      setLoading(false);
    }
  };

  const updateUser = async (data: Partial<User>) => {
    if (!firebaseUser) return;
    const userRef = doc(firestore, 'users', firebaseUser.uid);
    const updatedUser = { ...user, ...data } as User;
    await setDoc(userRef, updatedUser, { merge: true });
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, memberships, loading, signIn, logout, updateUser, switchWorkspace }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
