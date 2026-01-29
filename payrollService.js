import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { db } from './firebaseService.js';

const PAYROLL_COLLECTION = 'payrollRecords';

export const savePayrollRun = async (runData) => {
  try {
    const docRef = await addDoc(collection(db, PAYROLL_COLLECTION), {
      ...runData,
      generatedAt: serverTimestamp(),
    });
    console.log('PAYROLL SAVED:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('PAYROLL WRITE FAILED:', error);
    return null;
  }
};
