const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const withinTolerance = (actual, expected, tolerance = 1) =>
  Math.abs(toNumber(actual) - toNumber(expected)) <= tolerance;

const currentMonthKey = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${today.getFullYear()}-${month}`;
};

export const runEsiRules = ({ employee = {}, payrollRecord = {} }) => {
  const violations = [];
  const gross = toNumber(payrollRecord.gross ?? payrollRecord.monthlyGross ?? employee.gross ?? 0);
  const esiEnabled = Boolean(employee.esiEnabled ?? payrollRecord.esiEnabled);
  const esiEmployee = toNumber(
    payrollRecord.esiEmployee ?? payrollRecord.esiEmployeeContribution ?? payrollRecord.esi ?? payrollRecord.esiDeduction
  );
  const esiEmployer = toNumber(
    payrollRecord.esiEmployer ?? payrollRecord.esiEmployerContribution ?? payrollRecord.esiEmployerShare
  );

  if (gross > 0 && gross <= 21000 && !esiEnabled) {
    violations.push({
      type: 'ESI Eligibility',
      severity: 'High',
      message: 'ESI-eligible employee is not flagged for ESI coverage.',
      recommendedFix: 'Enable ESI and apply statutory deductions for eligible wages.',
    });
  }

  const expectedEmployee = gross * 0.0075;
  const expectedEmployer = gross * 0.0325;
  if (gross > 0 && !withinTolerance(esiEmployee, expectedEmployee, 2)) {
    violations.push({
      type: 'ESI Contribution Mismatch',
      severity: 'Medium',
      message: 'Employee ESI contribution does not match 0.75% of gross wages.',
      recommendedFix: 'Update employee ESI deductions to 0.75% of gross wages.',
    });
  }

  if (gross > 0 && !withinTolerance(esiEmployer, expectedEmployer, 5)) {
    violations.push({
      type: 'ESI Employer Contribution Mismatch',
      severity: 'Medium',
      message: 'Employer ESI contribution does not match 3.25% of gross wages.',
      recommendedFix: 'Update employer ESI contributions to 3.25% of gross wages.',
    });
  }

  if (gross > 21000 && esiEnabled) {
    const exitMonth = employee.esiExitMonth ?? payrollRecord.esiExitMonth ?? null;
    if (!exitMonth || exitMonth !== currentMonthKey()) {
      violations.push({
        type: 'ESI Exit Rule',
        severity: 'Medium',
        message: 'Employee crossed ESI threshold without an exit month recorded.',
        recommendedFix: 'Record the ESI exit month after crossing ₹21,000 gross wages.',
      });
    }
  }

  return violations;
};

export default runEsiRules;
