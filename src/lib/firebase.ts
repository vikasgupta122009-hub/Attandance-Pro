import { initializeApp } from 'firebase/app';
import { initializeAuth, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const firestoreDatabaseId = (firebaseConfig as any).firestoreDatabaseId;

// Improved version for iframes
export const auth = initializeAuth(app, {
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const db = getFirestore(app, firestoreDatabaseId);
export const firestore = db;
