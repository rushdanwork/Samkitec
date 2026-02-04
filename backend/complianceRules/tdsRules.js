const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const runTdsRules = ({ employee = {}, payrollRecord = {} }) => {
  const violations = [];
  const gross = toNumber(payrollRecord.gross ?? payrollRecord.monthlyGross ?? payrollRecord.totalEarnings ?? 0);
  const tdsDeduction = toNumber(payrollRecord.tds ?? payrollRecord.tdsDeduction ?? 0);
  const tdsRate = toNumber(payrollRecord.tdsRate ?? (gross ? tdsDeduction / gross : 0));
  const pan = employee.pan ?? employee.panNumber ?? payrollRecord.pan;

  if (!pan && gross > 0 && tdsRate < 0.2) {
    violations.push({
      type: 'TDS PAN Rule',
      severity: 'High',
      message: 'PAN missing and TDS rate is below 20%.',
      recommendedFix: 'Collect PAN or apply 20% TDS on taxable income until PAN is provided.',
    });
  }

  const employeeRegime = employee.taxRegime ?? employee.regime;
  const payrollRegime = payrollRecord.taxRegime ?? payrollRecord.regime;
  if (employeeRegime && payrollRegime && employeeRegime !== payrollRegime) {
    violations.push({
      type: 'TDS Regime Mismatch',
      severity: 'Medium',
      message: `Payroll regime (${payrollRegime}) does not match employee declaration (${employeeRegime}).`,
      recommendedFix: 'Align payroll tax regime with the employee declaration.',
    });
  }

  const expectedTax = toNumber(payrollRecord.tdsExpected ?? payrollRecord.expectedTds ?? 0);
  if (expectedTax > 0 && Math.abs(tdsDeduction - expectedTax) > 10) {
    violations.push({
      type: 'TDS Tax Mismatch',
      severity: 'Medium',
      message: 'Actual TDS deduction differs from expected tax calculation.',
      recommendedFix: 'Recompute TDS based on projected income and approved declarations.',
    });
  }

  const declaration = toNumber(employee.tdsDeclarationAmount ?? payrollRecord.tdsDeclarationAmount ?? 0);
  const proof = toNumber(employee.tdsProofAmount ?? payrollRecord.tdsProofAmount ?? 0);
  if (declaration > 0 && proof > 0 && declaration - proof > 1000) {
    violations.push({
      type: 'TDS Declaration/Proof Mismatch',
      severity: 'Low',
      message: 'Declared deductions exceed proofs submitted by a significant margin.',
      recommendedFix: 'Request updated proofs or adjust taxable income for unsupported declarations.',
    });
  }

  return violations;
};

export default runTdsRules;
