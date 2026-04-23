import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

let firebaseApp;
let firestoreDb;
let firebaseAuth;
let firebaseFunctions;
let currentUserId = null;

export const initializeFirebase = (config) => {
  if (!firebaseApp) {
    firebaseApp = initializeApp(config);
    firestoreDb = getFirestore(firebaseApp);
    firebaseAuth = getAuth(firebaseApp);
    firebaseFunctions = getFunctions(firebaseApp);
  }
  return { app: firebaseApp, db: firestoreDb, auth: firebaseAuth, functions: firebaseFunctions };
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

export const getFunctionsService = () => {
  if (!firebaseFunctions) {
    throw new Error('Firebase has not been initialized. Call initializeFirebase first.');
  }
  return firebaseFunctions;
};

export const getServerTimestamp = () => serverTimestamp();

const USERS_COLLECTION = 'users';
const getRequiredUserId = (userId) => {
  const resolvedUserId = userId || currentUserId;
  if (!resolvedUserId) {
    throw new Error('Authenticated user is required for this operation.');
  }
  return resolvedUserId;
};

export const getCurrentUserId = () => currentUserId;

export const getUserScopedCollectionRef = (collectionName, userId) => {
  const db = getFirestoreDb();
  const resolvedUserId = getRequiredUserId(userId);
  return collection(db, USERS_COLLECTION, resolvedUserId, collectionName);
};

export const getUserScopedDocRef = (collectionName, docId, userId) => {
  const db = getFirestoreDb();
  const resolvedUserId = getRequiredUserId(userId);
  return doc(db, USERS_COLLECTION, resolvedUserId, collectionName, docId);
};

export const ensureUserWorkspace = async (userId) => {
  const db = getFirestoreDb();
  const resolvedUserId = getRequiredUserId(userId);
  const userRef = doc(db, USERS_COLLECTION, resolvedUserId);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    await setDoc(userRef, {
      createdAt: getServerTimestamp(),
      isInitialized: true,
    });
  }
};

export const listenToAuthState = (onSuccess, onError) => {
  const auth = getAuthService();
  return onAuthStateChanged(
    auth,
    async (user) => {
      currentUserId = user?.uid || null;
      if (currentUserId) {
        await ensureUserWorkspace(currentUserId);
      }
      if (onSuccess) {
        onSuccess({ user, userId: currentUserId });
      }
    },
    (error) => {
      if (onError) onError(error);
    }
  );
};

const COMPLIANCE_COLLECTION = 'complianceViolations';
export const saveComplianceReport = async (employeeId, summary, violations, userId) => {
  const scopedUserId = getRequiredUserId(userId);
  const summaryObject = {
    summary: {
      ...summary,
      employeeId,
      lastEvaluated: getServerTimestamp(),
    },
  };
  const summaryRef = getUserScopedDocRef(COMPLIANCE_COLLECTION, employeeId, scopedUserId);
  const violationsRef = doc(summaryRef, 'violations', 'list');
  let violationsArray = [];

  try {
    const sourceViolations = Array.isArray(violations) ? violations : [];
    violationsArray = sourceViolations.map(({ type, severity, message, recommendedFix }) => ({
      type,
      severity,
      message,
      recommendedFix,
    }));
  } catch (error) {
    console.warn('[ComplianceReport] Failed to normalize violations array:', error);
    violationsArray = [];
  }

  await setDoc(summaryRef, summaryObject, { merge: true });
  await setDoc(violationsRef, { list: violationsArray });
};

export const getComplianceReports = async (userId) => {
  const snapshot = await getDocs(getUserScopedCollectionRef(COMPLIANCE_COLLECTION, userId));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

export const listenComplianceReports = (onSuccess, onError, userId) => {
  return onSnapshot(
    getUserScopedCollectionRef(COMPLIANCE_COLLECTION, userId),
    (snapshot) => {
      const reports = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onSuccess(reports);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
};

export const listenComplianceSummary = (onSuccess, onError, userId) =>
  listenComplianceReports(onSuccess, onError, userId);

const DIAGNOSTICS_COLLECTION = 'connectivityDiagnostics';
const REALTIME_COLLECTION = 'attendanceRecords';
const EXPENSES_COLLECTION = 'expenses';
const EMPLOYEES_COLLECTION = 'employees';
const PAYROLL_COLLECTION = 'payrollRecords';

export const runTestWriteRead = async (testDocId) => {
  const auth = getAuthService();
  const userId = getRequiredUserId(auth?.currentUser?.uid);
  const docId = testDocId || `diagnostic_${Date.now()}`;
  const docRef = getUserScopedDocRef(DIAGNOSTICS_COLLECTION, docId, userId);
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
  const userId = getRequiredUserId();
  const docRef = getUserScopedDocRef(DIAGNOSTICS_COLLECTION, `ping_${Date.now()}`, userId);
  const timeoutMs = 5000;

  const probePromise = (async () => {
    await setDoc(docRef, { createdAt: getServerTimestamp(), type: 'connectivityProbe' }, { merge: true });
    const snapshot = await getDoc(docRef);
    return snapshot.exists();
  })();

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(false), timeoutMs);
  });

  return Promise.race([probePromise, timeoutPromise]);
};

export const injectDemoDataWithErrors = async (uid) => {
  const userId = getRequiredUserId(uid);

  const employeesRef = getUserScopedCollectionRef(EMPLOYEES_COLLECTION, userId);
  const existingEmployeesSnapshot = await getDocs(employeesRef);
  if (!existingEmployeesSnapshot.empty) {
    return {
      inserted: false,
      reason: 'EMPLOYEES_ALREADY_EXIST',
      message: 'Skipped demo data injection because employees collection is not empty.',
    };
  }

  const month = '2026-04';
  const employees = [
    { employeeId: 'EMP001', name: 'Rahul Sharma', basic: 30000, hra: 15000, allowances: 5000 },
    { employeeId: 'EMP002', name: 'Priya Verma', basic: 28000, hra: 14000, allowances: 4000 },
    { employeeId: 'EMP003', name: 'Amit Khan', basic: 35000, hra: 17000, allowances: 6000 },
    { employeeId: 'EMP004', name: 'Neha Iyer', basic: 22000, hra: 11000, allowances: 3000 },
    { employeeId: 'EMP005', name: 'Vikram Singh', basic: 40000, hra: 20000, allowances: 8000 },
    { employeeId: 'EMP006', name: 'Sara Ali', basic: 18000, hra: 9000, allowances: 2000 },
    { employeeId: 'EMP007', name: 'Rohan Das', basic: 26000, hra: 13000, allowances: 3500 },
    { employeeId: 'EMP008', name: 'Anjali Mehta', basic: 32000, hra: 16000, allowances: 5500 },
    { employeeId: 'EMP009', name: 'Karan Patel', basic: 15000, hra: 7000, allowances: 1500 },
    { employeeId: 'EMP010', name: 'Deepak Roy', basic: 45000, hra: 22000, allowances: 9000 },
  ];

  const attendance = {
    month,
    records: {
      EMP001: 26,
      EMP002: 25,
      EMP003: 27,
      EMP004: 32,
      EMP005: -2,
      EMP006: 20,
      EMP007: 0,
      EMP008: 26,
      EMP009: 15,
      EMP010: 28,
    },
  };

  const payroll = [
    { employeeId: 'EMP001', month, basic: 30000, hra: 15000, allowances: 5000, pf: 3600, esi: 0, net: 46400 },
    { employeeId: 'EMP002', month, basic: 28000, hra: 14000, allowances: 4000, pf: 0, esi: 0, net: 46000 },
    { employeeId: 'EMP003', month, basic: 35000, hra: 17000, allowances: 6000, pf: 1000, esi: 0, net: 57000 },
    { employeeId: 'EMP004', month, basic: 22000, hra: 11000, allowances: 3000, pf: 2640, esi: 0, net: 40000 },
    { employeeId: 'EMP005', month, basic: 40000, hra: 20000, allowances: 8000, pf: 4800, esi: 0, net: 63200 },
    { employeeId: 'EMP006', month, basic: 18000, hra: 9000, allowances: 2000, pf: 2160, esi: 0, net: 26840 },
    { employeeId: 'EMP007', month, basic: 26000, hra: 13000, allowances: 3500, pf: 3120, esi: 0, net: 50000 },
    { employeeId: 'EMP008', month, basic: 32000, hra: 16000, allowances: 5500, pf: 3840, esi: 0, net: 49660 },
    { employeeId: 'EMP009', month, basic: 15000, hra: 7000, allowances: 1500, pf: 0, esi: 0, net: 23500 },
    { employeeId: 'EMP010', month, basic: 45000, hra: 22000, allowances: 9000, pf: 0, esi: 0, net: 90000 },
  ];

  const attendanceDayDocs = {};
  const daysInMonth = 30;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `2026-04-${String(day).padStart(2, '0')}`;
    const dayRecords = {};
    employees.forEach(({ employeeId }) => {
      const presentDays = Number(attendance.records[employeeId] ?? 0);
      const status = day <= presentDays ? 'present' : 'absent';
      dayRecords[employeeId] = { status };
    });
    attendanceDayDocs[dateKey] = { records: dayRecords };
  }

  await Promise.all(
    employees.map((employee) =>
      setDoc(getUserScopedDocRef(EMPLOYEES_COLLECTION, employee.employeeId, userId), {
        ...employee,
        status: 'active',
        pfApplicable: true,
        esiApplicable: employee.basic <= 21000,
        createdAt: getServerTimestamp(),
      })
    )
  );

  await Promise.all(
    Object.entries(attendanceDayDocs).map(([dateKey, data]) =>
      setDoc(getUserScopedDocRef(REALTIME_COLLECTION, dateKey, userId), data)
    )
  );

  await setDoc(getUserScopedDocRef(REALTIME_COLLECTION, `${month}-summary`, userId), attendance, { merge: true });

  await Promise.all(
    payroll.map((record) => {
      const gross = Number(record.basic) + Number(record.hra) + Number(record.allowances);
      return setDoc(getUserScopedDocRef(PAYROLL_COLLECTION, `${record.employeeId}_${record.month}`, userId), {
        ...record,
        gross,
        deductions: Number(record.pf) + Number(record.esi),
        createdAt: getServerTimestamp(),
      });
    })
  );

  return {
    inserted: true,
    month,
    employeesInserted: employees.length,
    attendanceDocsInserted: Object.keys(attendanceDayDocs).length + 1,
    payrollRecordsInserted: payroll.length,
    expectedViolations: ['PF_MISSING', 'PF_INCORRECT', 'NET_MISMATCH', 'ATTENDANCE_INVALID', 'ESI_MISSING'],
  };
};

export const listenExpenseRecords = (onSuccess, onError) => {
  return onSnapshot(
    query(getUserScopedCollectionRef(EXPENSES_COLLECTION), orderBy('createdAt', 'desc')),
    (snapshot) => {
      const records = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onSuccess(records);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
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
