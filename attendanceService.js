import { onSnapshot, setDoc } from 'firebase/firestore';

import { getFirestoreDb, getUserScopedCollectionRef, getUserScopedDocRef } from './firebaseService.js';

const ATTENDANCE_COLLECTION = 'attendanceRecords';

export const listenAttendanceRecords = (onSuccess, onError, userId) => {
  getFirestoreDb();
  return onSnapshot(
    getUserScopedCollectionRef(ATTENDANCE_COLLECTION, userId),
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

export const saveAttendanceRecord = async (dateKey, record, userId) => {
  getFirestoreDb();
  const nextRecords = record?.records && typeof record.records === 'object' ? record.records : {};
  await setDoc(getUserScopedDocRef(ATTENDANCE_COLLECTION, dateKey, userId), { records: nextRecords });
};
