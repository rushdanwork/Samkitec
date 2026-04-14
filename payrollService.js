import {
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import {
  getFirestoreDb,
  getUserScopedCollectionRef,
  getFunctionsService,
} from './firebaseService.js';

const PAYROLL_RUNS_COLLECTION = 'payrollRuns';
const PAYROLL_SUMMARY_COLLECTION = 'payrollRecords';

export const listenPayrollRuns = (month, onSuccess, onError, userId) => {
  getFirestoreDb();
  const payrollQuery = query(
    getUserScopedCollectionRef(PAYROLL_RUNS_COLLECTION, userId),
    where('month', '==', month),
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

export const finalizePayrollRun = async ({ month }) => {
  const callable = httpsCallable(getFunctionsService(), 'finalizePayroll');
  const response = await callable({ month });
  return response.data;
};

export const listenPayrollRecordsForMonth = (month, onSuccess, onError, userId) =>
  onSnapshot(
    query(
      getUserScopedCollectionRef(PAYROLL_SUMMARY_COLLECTION, userId),
      where('month', '==', month),
      orderBy('createdAt', 'desc')
    ),
    (snapshot) => onSuccess(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))),
    (error) => {
      if (onError) onError(error);
    }
  );
