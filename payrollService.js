import {
  deleteDoc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';

import {
  getFirestoreDb,
  getServerTimestamp,
  getUserScopedCollectionRef,
  getUserScopedDocRef,
} from './firebaseService.js';
import { normalizePayrollRecord, normalizePayrollRunSnapshot } from './payrollNormalization.js';

const PAYROLL_SUMMARY_COLLECTION = 'payrollRecords';
const PAYROLL_RUNS_COLLECTION = 'payrollRuns';

export const listenPayrollRuns = (onSuccess, onError, userId) => {
  getFirestoreDb();
  const payrollQuery = query(
    getUserScopedCollectionRef(PAYROLL_RUNS_COLLECTION, userId),
    orderBy('generatedAt', 'desc')
  );

  return onSnapshot(
    payrollQuery,
    (snapshot) => {
      const runs = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      onSuccess(runs);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
};

export const savePayrollRun = async (payload, userId) => {
  getFirestoreDb();
  const normalized = normalizePayrollRecord(payload);
  const employeeId = normalized.employeeId;
  const month = normalized.month;

  if (!employeeId || !month) {
    throw new Error('savePayrollRun requires both employeeId and month.');
  }

  const docId = `${employeeId}_${month}`;
  const payrollRef = getUserScopedDocRef(PAYROLL_SUMMARY_COLLECTION, docId, userId);
  const payrollRecord = {
    ...normalized,
    basic: Number(payload.basic ?? payload.basicSalary ?? 0),
    hra: Number(payload.hra ?? 0),
    allowances: Number(payload.allowances ?? 0),
    generatedAt: getServerTimestamp(),
  };

  await setDoc(payrollRef, payrollRecord, { merge: true });
  return docId;
};

export const savePayrollRunSnapshot = async (payload = {}, userId) => {
  getFirestoreDb();
  const monthInput = String(payload.month || '').trim();
  const yearInput = String(payload.year || '').trim();

  let runId = '';
  let month = monthInput;
  let year = yearInput;

  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput)) {
    runId = monthInput;
    year = monthInput.slice(0, 4);
    month = monthInput.slice(5, 7);
  } else if (monthInput && yearInput) {
    month = monthInput.padStart(2, '0');
    runId = `${yearInput}-${month}`;
  }

  if (!runId) {
    throw new Error('savePayrollRunSnapshot requires month and year.');
  }

  const runRef = getUserScopedDocRef(PAYROLL_RUNS_COLLECTION, runId, userId);
  const runPayload = {
    ...normalizePayrollRunSnapshot({ ...payload, month, year }),
    generatedAt: getServerTimestamp(),
  };

  await setDoc(runRef, runPayload, { merge: true });
  return runId;
};

export const getPayrollForEmployee = async (employeeId, month, userId) => {
  getFirestoreDb();
  const safeEmployeeId = String(employeeId || '').trim();
  const safeMonth = String(month || '').trim();

  if (!safeEmployeeId || !safeMonth) {
    throw new Error('getPayrollForEmployee requires both employeeId and month.');
  }

  const payrollRef = getUserScopedDocRef(PAYROLL_SUMMARY_COLLECTION, `${safeEmployeeId}_${safeMonth}`, userId);
  const snapshot = await getDoc(payrollRef);

  if (!snapshot.exists()) return null;

  return { id: snapshot.id, ...snapshot.data() };
};

export const deletePayrollRun = async (runId, userId) => {
  getFirestoreDb();
  await deleteDoc(getUserScopedDocRef(PAYROLL_SUMMARY_COLLECTION, runId, userId));
};
