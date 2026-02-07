import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  orderBy,
  increment,
  setDoc,
  getDoc,
} from 'firebase/firestore';

import { getFirestoreDb, getServerTimestamp } from '../firebaseService.js';

const EXPENSES_COLLECTION = 'expenses';
const LIMITS_COLLECTION = 'expenseLimits';
const STATS_COLLECTION = 'employeeExpenseStats';

export const submitExpense = async (payload) => {
  const db = getFirestoreDb();
  const expensePayload = {
    employeeId: payload.employeeId,
    employeeName: payload.employeeName,
    amount: Number(payload.amount) || 0,
    vendor: payload.vendor || 'Unknown Vendor',
    category: payload.category || 'misc',
    date: payload.date || new Date().toISOString().split('T')[0],
    status: 'submitted',
    receiptUrl: payload.receiptUrl || '',
    payrollLinked: false,
    payrollRunId: null,
    createdAt: getServerTimestamp(),
    approvedAt: null,
    approverId: null,
    ocrExtractedData: payload.ocrExtractedData || {},
  };

  const docRef = await addDoc(collection(db, EXPENSES_COLLECTION), expensePayload);
  await updateStats(payload.employeeId, expensePayload);
  return docRef.id;
};

export const updateExpenseStatus = async (expenseId, status, approverId, note) => {
  const db = getFirestoreDb();
  const updatePayload = {
    status,
    approverId: approverId || null,
    approvedAt: status === 'approved' || status === 'rejected' ? getServerTimestamp() : null,
  };

  if (note) {
    updatePayload.approvalNote = note;
  }

  await updateDoc(doc(db, EXPENSES_COLLECTION, expenseId), updatePayload);
  return true;
};

export const getEmployeeExpenses = async (employeeId) => {
  const db = getFirestoreDb();
  const expenseQuery = query(
    collection(db, EXPENSES_COLLECTION),
    where('employeeId', '==', employeeId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(expenseQuery);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

export const getPendingApprovals = async () => {
  const db = getFirestoreDb();
  const expenseQuery = query(
    collection(db, EXPENSES_COLLECTION),
    where('status', '==', 'submitted'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(expenseQuery);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

export const linkExpenseToPayroll = async (expenseId, payrollRunId) => {
  const db = getFirestoreDb();
  await updateDoc(doc(db, EXPENSES_COLLECTION, expenseId), {
    payrollLinked: true,
    payrollRunId,
    status: 'paid',
  });
  return true;
};

export const updateStats = async (employeeId, expensePayload) => {
  if (!employeeId) return null;
  const db = getFirestoreDb();
  const statsRef = doc(db, STATS_COLLECTION, employeeId);
  const statsSnap = await getDoc(statsRef);
  const baseStats = statsSnap.exists()
    ? statsSnap.data()
    : {
        totalSpentThisMonth: 0,
        categoryBreakdown: {
          travel: 0,
          meals: 0,
          office: 0,
          misc: 0,
          fuel: 0,
        },
      };

  const category = expensePayload.category || 'misc';
  const amount = Number(expensePayload.amount) || 0;

  await setDoc(
    statsRef,
    {
      totalSpentThisMonth: increment(amount),
      categoryBreakdown: {
        ...baseStats.categoryBreakdown,
        [category]: increment(amount),
      },
      updatedAt: getServerTimestamp(),
    },
    { merge: true }
  );

  const limitRef = doc(db, LIMITS_COLLECTION, employeeId);
  await setDoc(
    limitRef,
    {
      lastReset: baseStats.lastReset || getServerTimestamp(),
    },
    { merge: true }
  );

  return true;
};
