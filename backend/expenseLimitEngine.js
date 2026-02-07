import { doc, getDoc } from 'firebase/firestore';

import { getFirestoreDb } from '../firebaseService.js';

const DEFAULT_LIMITS = {
  monthlyLimit: 25000,
  categoryLimits: {
    travel: 10000,
    meals: 5000,
    office: 4000,
    misc: 3000,
    fuel: 6000,
  },
};

export const checkMonthlyLimit = async (employeeId, amount = 0) => {
  const db = getFirestoreDb();
  const ref = doc(db, 'expenseLimits', employeeId);
  const snapshot = await getDoc(ref);
  const data = snapshot.exists() ? snapshot.data() : DEFAULT_LIMITS;
  const monthlyLimit = data.monthlyLimit ?? DEFAULT_LIMITS.monthlyLimit;
  const allowed = Number(amount) <= Number(monthlyLimit || 0);

  return {
    allowed,
    reason: allowed ? '' : 'Monthly expense limit exceeded.',
    requiredApprovalLevel: allowed ? 'manager' : 'finance',
    limit: monthlyLimit,
  };
};

export const checkCategoryLimit = async (employeeId, category, amount = 0) => {
  const db = getFirestoreDb();
  const ref = doc(db, 'expenseLimits', employeeId);
  const snapshot = await getDoc(ref);
  const data = snapshot.exists() ? snapshot.data() : DEFAULT_LIMITS;
  const limit = data.categoryLimits?.[category] ?? DEFAULT_LIMITS.categoryLimits[category] ?? 0;
  const allowed = Number(amount) <= Number(limit || 0);

  return {
    allowed,
    reason: allowed ? '' : `Category limit exceeded for ${category}.`,
    requiredApprovalLevel: allowed ? 'manager' : 'finance',
    limit,
  };
};
