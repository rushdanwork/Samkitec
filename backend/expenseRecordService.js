import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { getFirestoreDb, getServerTimestamp, listenExpenseRecords } from '../firebaseService.js';

const EXPENSES_COLLECTION = 'expenses';

export const addExpense = async (payload) => {
  const db = getFirestoreDb();
  const expensePayload = {
    title: payload.title?.trim() || 'Untitled Expense',
    vendor: payload.vendor?.trim() || 'Unknown Vendor',
    category: payload.category || 'misc',
    amount: Number(payload.amount) || 0,
    date: payload.date || new Date().toISOString().split('T')[0],
    notes: payload.notes?.trim() || '',
    receiptUrl: payload.receiptUrl || '',
    createdAt: getServerTimestamp(),
  };

  const docRef = await addDoc(collection(db, EXPENSES_COLLECTION), expensePayload);
  return docRef.id;
};

const padMonth = (value) => String(value).padStart(2, '0');

export const getExpensesByMonth = async (month, year) => {
  const db = getFirestoreDb();
  const monthKey = `${year}-${padMonth(month)}`;
  const endDateValue = new Date(year, Number(month), 0).getDate();
  const startDate = `${monthKey}-01`;
  const endDate = `${monthKey}-${String(endDateValue).padStart(2, '0')}`;
  const expenseQuery = query(
    collection(db, EXPENSES_COLLECTION),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(expenseQuery);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

export const getAllExpenses = async () => {
  const db = getFirestoreDb();
  const expenseQuery = query(collection(db, EXPENSES_COLLECTION), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(expenseQuery);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

export const groupByCategory = (expenses = []) =>
  expenses.reduce((acc, expense) => {
    const key = expense.category || 'misc';
    acc[key] = (acc[key] || 0) + (Number(expense.amount) || 0);
    return acc;
  }, {});

export const groupByDate = (expenses = []) =>
  expenses.reduce((acc, expense) => {
    const key = expense.date || 'Unknown';
    acc[key] = (acc[key] || 0) + (Number(expense.amount) || 0);
    return acc;
  }, {});

export const uploadReceipt = (fileOrBase64) => {
  if (!fileOrBase64) return Promise.resolve('');
  if (typeof fileOrBase64 === 'string') {
    return Promise.resolve(fileOrBase64);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read receipt image.'));
    reader.readAsDataURL(fileOrBase64);
  });
};

export const onExpensesChanged = (callback, onError) => {
  if (listenExpenseRecords) {
    return listenExpenseRecords(callback, onError);
  }
  const db = getFirestoreDb();
  const expenseQuery = query(collection(db, EXPENSES_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    expenseQuery,
    (snapshot) => {
      const records = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      callback(records);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
};
