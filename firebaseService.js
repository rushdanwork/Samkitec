import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
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

export const listenComplianceReports = (onSuccess, onError) => {
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

export const listenComplianceSummary = (onSuccess, onError) =>
  listenComplianceReports(onSuccess, onError);

const DIAGNOSTICS_COLLECTION = 'connectivityDiagnostics';
const REALTIME_COLLECTION = 'attendanceRecords';

export const runTestWriteRead = async (testDocId) => {
  const db = getFirestoreDb();
  const auth = getAuthService();
  const docId = testDocId || `diagnostic_${Date.now()}`;
  const docRef = doc(db, DIAGNOSTICS_COLLECTION, docId);
  const payload = {
    createdAt: getServerTimestamp(),
    uid: auth?.currentUser?.uid || null,
  };

  let testWrite = false;
  let testRead = false;

  try {
    await setDoc(docRef, payload, { merge: true });
    testWrite = true;
  } catch (error) {
    console.warn('[FirebaseCheck] Write test failed:', error);
  }

  try {
    const snapshot = await getDoc(docRef);
    testRead = snapshot.exists();
  } catch (error) {
    console.warn('[FirebaseCheck] Read test failed:', error);
  }

  return { testWrite, testRead, docId };
};

export const testRealtimeListener = async () => {
  const db = getFirestoreDb();
  let unsubscribe = () => {};
  let timeoutId;

  const listenPromise = new Promise((resolve) => {
    unsubscribe = onSnapshot(
      collection(db, REALTIME_COLLECTION),
      (snap) => {
        console.log('[RealtimeTest] Listener triggered. Docs:', snap.size);
        unsubscribe();
        resolve(true);
      },
      (error) => {
        console.warn('[RealtimeTest] Listener error:', error);
        unsubscribe();
        resolve(false);
      }
    );
  });

  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn('[RealtimeTest] Listener timed out.');
      unsubscribe();
      resolve(false);
    }, 5000);
  });

  const result = await Promise.race([listenPromise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
};

export const firebaseConnectivityCheck = async () => {
  console.log('[FirebaseCheck] Starting diagnostics...');
  const results = {
    sdkLoaded: false,
    firestoreConnected: false,
    authWorking: false,
    testWrite: false,
    testRead: false,
    realtimeListener: false,
  };

  try {
    results.sdkLoaded = Boolean(initializeApp);
  } catch (error) {
    console.warn('[FirebaseCheck] SDK load check failed:', error);
  }

  let db;
  let auth;

  try {
    db = getFirestoreDb();
    results.firestoreConnected = Boolean(db);
  } catch (error) {
    console.warn('[FirebaseCheck] Firestore init check failed:', error);
  }

  try {
    auth = getAuthService();
    results.authWorking = Boolean(auth);
  } catch (error) {
    console.warn('[FirebaseCheck] Auth check failed:', error);
  }

  if (db && auth) {
    const { testWrite, testRead } = await runTestWriteRead();
    results.testWrite = testWrite;
    results.testRead = testRead;

    results.realtimeListener = await testRealtimeListener();
  }

  console.table(results);
  return results;
};
