import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, serverTimestamp } from 'firebase/firestore';

let firebaseApp;
let firestoreDb;
let firebaseAuth;
export let db = typeof window !== 'undefined' ? window.firebaseDb : undefined;

export const initializeFirebase = (config) => {
  if (!firebaseApp) {
    firebaseApp = initializeApp(config);
    firestoreDb = getFirestore(firebaseApp);
    db = firestoreDb;
    firebaseAuth = getAuth(firebaseApp);
  }
  return { app: firebaseApp, db: firestoreDb, auth: firebaseAuth };
};

export const getFirestoreDb = () => {
  if (!firestoreDb && typeof window !== 'undefined' && window.firebaseDb) {
    db = window.firebaseDb;
    return db;
  }

  if (!firestoreDb) {
    throw new Error('Firebase has not been initialized. Call initializeFirebase first.');
  }
  return firestoreDb;
};

export const getAuthService = () => {
  if (!firebaseAuth) {
    throw new Error('Firebase has not been initialized. Call initializeFirebase first.');
  }
  return firebaseAuth;
};

export const getServerTimestamp = () => serverTimestamp();
