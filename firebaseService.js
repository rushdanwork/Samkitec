import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

let firebaseApp;
let firestoreDb;
let firebaseAuth;

export const initializeFirebase = (config) => {
  if (!firebaseApp) {
    firebaseApp = initializeApp(config);
    firestoreDb = getFirestore(firebaseApp);
    firebaseAuth = getAuth(firebaseApp);
  }
  return { app: firebaseApp, db: firestoreDb, auth: firebaseAuth };
};

export const getFirestoreDb = () => {
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

const COMPLIANCE_COLLECTION = 'complianceViolations';

export const saveComplianceReport = async (employeeId, summary, violations) => {
  const db = getFirestoreDb();
  const payload = {
    summary: {
      ...summary,
      employeeId,
      lastEvaluated: getServerTimestamp(),
    },
    violations: (violations || []).map((violation) => ({
      ...violation,
      timestamp: getServerTimestamp(),
    })),
  };
  await setDoc(doc(db, COMPLIANCE_COLLECTION, employeeId), payload, { merge: true });
};

export const getComplianceReports = async () => {
  const db = getFirestoreDb();
  const snapshot = await getDocs(collection(db, COMPLIANCE_COLLECTION));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

export const listenComplianceSummary = (onSuccess, onError) => {
  const db = getFirestoreDb();
  return onSnapshot(
    collection(db, COMPLIANCE_COLLECTION),
    (snapshot) => {
      const reports = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onSuccess(reports);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
};
