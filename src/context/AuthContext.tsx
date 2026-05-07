import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, firestore } from '../lib/firebase';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      if (fUser) {
        // Fetch user doc
        const userDoc = await getDoc(doc(firestore, 'users', fUser.uid));
        if (userDoc.exists()) {
          setUser(userDoc.data() as User);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async () => {
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
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateUser = async (data: Partial<User>) => {
    if (!firebaseUser) return;
    const userRef = doc(firestore, 'users', firebaseUser.uid);
    const updatedUser = { ...user, ...data } as User;
    await setDoc(userRef, updatedUser, { merge: true });
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, logout, updateUser }}>
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
