import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { getFirestoreDb, getServerTimestamp } from '../firebaseService.js';

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

export const getExpensesByMonth = async (monthKey) => {
  const db = getFirestoreDb();
  const startDate = `${monthKey}-01`;
  const endDate = `${monthKey}-31`;
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

export const groupExpensesByCategory = (expenses = []) =>
  expenses.reduce((acc, expense) => {
    const key = expense.category || 'misc';
    acc[key] = (acc[key] || 0) + (Number(expense.amount) || 0);
    return acc;
  }, {});

export const groupExpensesByVendor = (expenses = []) =>
  expenses.reduce((acc, expense) => {
    const key = expense.vendor || 'Unknown';
    acc[key] = (acc[key] || 0) + (Number(expense.amount) || 0);
    return acc;
  }, {});
