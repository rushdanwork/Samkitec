import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

import { getFirestoreDb, getServerTimestamp } from './firebaseService.js';

const PAYROLL_COLLECTION = 'payrollRecords';
const EXPENSES_COLLECTION = 'expenses';

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
  const docRef = await addDoc(collection(db, PAYROLL_COLLECTION), {
    ...payload,
    generatedAt: getServerTimestamp(),
    status: payload.status || 'Completed',
  });
  return docRef.id;
};

export const deletePayrollRun = async (runId) => {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, PAYROLL_COLLECTION, runId));
};

export const addApprovedExpensesToPayroll = async (employeeId, payrollRunId) => {
  const db = getFirestoreDb();
  const expenseQuery = query(
    collection(db, EXPENSES_COLLECTION),
    where('employeeId', '==', employeeId),
    where('status', '==', 'approved'),
    where('payrollLinked', '==', false)
  );

  const snapshot = await getDocs(expenseQuery);
  const expenses = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const reimbursementTotal = expenses.reduce(
    (sum, expense) => sum + (Number(expense.amount) || 0),
    0
  );

  await Promise.all(
    expenses.map((expense) =>
      updateDoc(doc(db, EXPENSES_COLLECTION, expense.id), {
        payrollLinked: true,
        payrollRunId: payrollRunId || null,
        status: payrollRunId ? 'paid' : 'approved',
      })
    )
  );

  return reimbursementTotal;
};
