const ERM_SERVICE_FILENAME =
  typeof __filename !== 'undefined' ? __filename : 'backend/expenseRecordService.js';
console.log('[ERM] File loaded:', ERM_SERVICE_FILENAME);

(function () {
  const ensureFirebase = () => {
    if (!window.firebaseDb || !window.firestoreFunctions) {
      throw new Error('Firebase is not initialized for ERM.');
    }
  };

  const ensureStorage = () => {
    if (!window.firebaseStorage || !window.storageFunctions) {
      throw new Error('Firebase Storage is not initialized for ERM.');
    }
  };

  const getCollectionRef = () => {
    ensureFirebase();
    const { collection } = window.firestoreFunctions;
    return collection(window.firebaseDb, 'expenses');
  };

  const addExpense = async (payload = {}) => {
    try {
      ensureFirebase();
      const { addDoc, serverTimestamp } = window.firestoreFunctions;
      const date = payload.date || new Date().toISOString().slice(0, 10);
      const yearMonth = payload.yearMonth || date.slice(0, 7);
      const amount = Number(payload.amount) || 0;
      const expenseData = {
        date,
        yearMonth,
        category: payload.category || 'Misc',
        amount,
        vendor: payload.vendor || '',
        notes: payload.notes || '',
        receiptURL: payload.receiptURL || '',
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(getCollectionRef(), expenseData);
      return docRef.id;
    } catch (err) {
      console.error('[ERM] Error in addExpense:', err);
      throw err;
    }
  };

  const getExpenses = async () => {
    try {
      ensureFirebase();
      const { getDocs, orderBy, query } = window.firestoreFunctions;
      const snapshot = await getDocs(query(getCollectionRef(), orderBy('createdAt', 'desc')));
      return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (err) {
      console.error('[ERM] Error in getExpenses:', err);
      return [];
    }
  };

  const getExpensesByMonth = async (yearMonth) => {
    try {
      ensureFirebase();
      const { getDocs, orderBy, query, where } = window.firestoreFunctions;
      const snapshot = await getDocs(
        query(getCollectionRef(), where('yearMonth', '==', yearMonth), orderBy('date', 'desc'))
      );
      return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (err) {
      console.error('[ERM] Error in getExpensesByMonth:', err);
      return [];
    }
  };

  const uploadReceipt = async (file) => {
    try {
      if (!file) return '';
      ensureStorage();
      const { storageRef, uploadBytes, getDownloadURL } = window.storageFunctions;
      const safeName = `${Date.now()}_${file.name || 'receipt'}`;
      const receiptRef = storageRef(window.firebaseStorage, `expenses/${safeName}`);
      const snapshot = await uploadBytes(receiptRef, file);
      return await getDownloadURL(snapshot.ref);
    } catch (err) {
      console.error('[ERM] Error in uploadReceipt:', err);
      return '';
    }
  };

  const listenToExpenses = (callback) => {
    try {
      ensureFirebase();
      const { onSnapshot, orderBy, query } = window.firestoreFunctions;
      return onSnapshot(
        query(getCollectionRef(), orderBy('createdAt', 'desc')),
        (snapshot) => {
          const records = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          if (typeof callback === 'function') callback(records);
        },
        (error) => {
          console.error('[ERM] Error in listenToExpenses:', error);
        }
      );
    } catch (err) {
      console.error('[ERM] Error in listenToExpenses:', err);
      return null;
    }
  };

  window.expenseRecordService = {
    addExpense,
    getExpenses,
    getExpensesByMonth,
    uploadReceipt,
    listenToExpenses,
  };
})();
