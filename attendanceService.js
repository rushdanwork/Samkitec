import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';

import { getFirestoreDb } from './firebaseService.js';

const ATTENDANCE_COLLECTION = 'attendanceRecords';

export const listenAttendanceRecords = (onSuccess, onError) => {
  const db = getFirestoreDb();
  return onSnapshot(
    collection(db, ATTENDANCE_COLLECTION),
    (snapshot) => {
      const records = {};
      snapshot.forEach((docSnap) => {
        records[docSnap.id] = docSnap.data();
      });
      onSuccess(records);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
};

export const saveAttendanceRecord = async (dateKey, record) => {
  const db = getFirestoreDb();
  await setDoc(doc(db, ATTENDANCE_COLLECTION, dateKey), record);
};
