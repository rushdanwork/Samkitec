import { updateExpenseStatus } from './expenseService.js';

export const notifyEmployee = (payload) => {
  console.info('[ExpenseApproval] Notify employee:', payload);
};

export const notifyManager = (payload) => {
  console.info('[ExpenseApproval] Notify manager:', payload);
};

export const approveExpense = async ({ expenseId, approverId, note }) => {
  const updated = await updateExpenseStatus(expenseId, 'approved', approverId);
  notifyEmployee({ expenseId, status: 'approved', note });
  notifyManager({ expenseId, status: 'approved', note });
  return updated;
};

export const rejectExpense = async ({ expenseId, approverId, reason }) => {
  const updated = await updateExpenseStatus(expenseId, 'rejected', approverId, reason);
  notifyEmployee({ expenseId, status: 'rejected', reason });
  notifyManager({ expenseId, status: 'rejected', reason });
  return updated;
};
