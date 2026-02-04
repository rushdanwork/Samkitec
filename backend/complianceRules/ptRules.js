const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const runPtRules = ({ employee = {}, payrollRecord = {}, stateRules = {} }) => {
  const violations = [];
  const state = employee.state ?? employee.workState ?? payrollRecord.state;
  const slabs = stateRules.ptSlabs?.[state] || stateRules.ptSlabs?.default || [];
  const gross = toNumber(payrollRecord.gross ?? payrollRecord.monthlyGross ?? payrollRecord.totalEarnings ?? 0);
  const ptDeduction = toNumber(payrollRecord.pt ?? payrollRecord.ptDeduction ?? 0);
  const expected = slabs.find((slab) => gross >= slab.min && gross <= slab.max);

  if (!expected && ptDeduction > 0) {
    violations.push({
      type: 'PT Deduction Invalid State',
      severity: 'Medium',
      message: `PT deducted in ${state || 'state'} where no PT slab is configured.`,
      recommendedFix: 'Remove PT deduction or configure the correct state slab before deduction.',
    });
  }

  if (expected && ptDeduction === 0) {
    violations.push({
      type: 'PT Missing',
      severity: 'High',
      message: 'PT deduction missing for applicable slab.',
      recommendedFix: 'Apply PT deduction according to the configured slab for the state.',
    });
  }

  if (expected && ptDeduction > 0 && ptDeduction !== toNumber(expected.amount)) {
    violations.push({
      type: 'PT Slab Mismatch',
      severity: 'Medium',
      message: `PT deduction should be ₹${expected.amount} for the current slab.`,
      recommendedFix: 'Align PT deduction with the state slab for the current gross wage.',
    });
  }

  if (expected && ptDeduction > toNumber(expected.amount) * 1.5) {
    violations.push({
      type: 'PT Deducted Twice',
      severity: 'Medium',
      message: 'PT deduction appears to be applied more than once.',
      recommendedFix: 'Check payroll rules to prevent duplicate PT deductions.',
    });
  }

  return violations;
};

export default runPtRules;
