import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
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
