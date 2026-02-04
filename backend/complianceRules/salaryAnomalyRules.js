const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const average = (values = []) =>
  values.length ? values.reduce((sum, value) => sum + toNumber(value), 0) / values.length : 0;

export const runSalaryAnomalyRules = ({ payrollHistory = [], payrollRecord = {} }) => {
  const violations = [];
  const history = payrollHistory.slice(0, -1);
  const recent = history.slice(-3);

  const currentGross = toNumber(payrollRecord.gross ?? payrollRecord.monthlyGross ?? payrollRecord.totalEarnings ?? 0);
  const averageGross = average(recent.map((record) => record.gross ?? record.monthlyGross ?? record.totalEarnings));

  if (averageGross > 0 && currentGross > averageGross * 1.4) {
    violations.push({
      type: 'Salary Spike',
      severity: 'High',
      message: 'Gross salary spiked more than 40% compared to recent average.',
      recommendedFix: 'Validate incentives, bonuses, or adjustments before releasing payroll.',
    });
  }

  const currentReimbursement = toNumber(payrollRecord.reimbursement ?? payrollRecord.reimbursements ?? 0);
  const avgReimbursement = average(recent.map((record) => record.reimbursement ?? record.reimbursements));
  if (avgReimbursement > 0 && currentReimbursement > avgReimbursement * 1.5) {
    violations.push({
      type: 'Reimbursement Spike',
      severity: 'Medium',
      message: 'Reimbursements spiked significantly compared to recent history.',
      recommendedFix: 'Review reimbursement claims and approvals for this cycle.',
    });
  }

  const currentDeductions = toNumber(payrollRecord.totalDeductions ?? payrollRecord.deductions ?? 0);
  const avgDeductions = average(recent.map((record) => record.totalDeductions ?? record.deductions));
  if (avgDeductions > 0 && currentDeductions < avgDeductions * 0.5) {
    violations.push({
      type: 'Deduction Drop Anomaly',
      severity: 'Medium',
      message: 'Total deductions dropped sharply compared to recent periods.',
      recommendedFix: 'Check deductions for missed statutory or voluntary items.',
    });
  }

  return violations;
};

export default runSalaryAnomalyRules;
