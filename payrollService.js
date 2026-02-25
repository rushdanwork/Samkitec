import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';

import { getFirestoreDb, getServerTimestamp } from './firebaseService.js';

const PAYROLL_COLLECTION = 'payrollRecords';

export const listenPayrollRuns = (onSuccess, onError) => {
  const db = getFirestoreDb();
  const payrollQuery = query(
    collection(db, PAYROLL_COLLECTION),
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

export const savePayrollRun = async (payload) => {
  const db = getFirestoreDb();
  const employeeId = String(payload.employeeId || '').trim();
  const month = String(payload.month || '').trim();

  if (!employeeId || !month) {
    throw new Error('savePayrollRun requires both employeeId and month.');
  }

  const docId = `${employeeId}_${month}`;
  const payrollRef = doc(db, PAYROLL_COLLECTION, docId);
  const payrollRecord = {
    employeeId,
    month,
    basic: Number(payload.basic ?? payload.basicSalary ?? 0),
    hra: Number(payload.hra ?? 0),
    allowances: Number(payload.allowances ?? 0),
    pf: Number(payload.pf ?? 0),
    esi: Number(payload.esi ?? 0),
    deductions: Number(payload.deductions ?? 0),
    gross: Number(payload.gross ?? payload.earnings ?? 0),
    net: Number(payload.net ?? payload.netSalary ?? payload.netPay ?? 0),
    generatedAt: getServerTimestamp(),
  };

  await setDoc(payrollRef, payrollRecord, { merge: true });
  return docId;
};

export const getPayrollForEmployee = async (employeeId, month) => {
  const db = getFirestoreDb();
  const safeEmployeeId = String(employeeId || '').trim();
  const safeMonth = String(month || '').trim();

  if (!safeEmployeeId || !safeMonth) {
    throw new Error('getPayrollForEmployee requires both employeeId and month.');
  }

  const payrollRef = doc(db, PAYROLL_COLLECTION, `${safeEmployeeId}_${safeMonth}`);
  const snapshot = await getDoc(payrollRef);

  if (!snapshot.exists()) return null;

  return { id: snapshot.id, ...snapshot.data() };
};

export const deletePayrollRun = async (runId) => {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, PAYROLL_COLLECTION, runId));
};
