const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const withinTolerance = (actual, expected, tolerance = 1) =>
  Math.abs(toNumber(actual) - toNumber(expected)) <= tolerance;

export const runPfRules = ({ employee = {}, payrollRecord = {} }) => {
  const violations = [];
  const basic = toNumber(payrollRecord.basic ?? employee.basic ?? employee.basicSalary);
  const da = toNumber(payrollRecord.da ?? employee.da ?? employee.dearnessAllowance);
  const pfWage = toNumber(payrollRecord.pfWage ?? payrollRecord.pfWages ?? basic + da);
  const pfEnabled = Boolean(employee.pfEnabled ?? payrollRecord.pfEnabled);
  const epf = toNumber(payrollRecord.epf ?? payrollRecord.epfEmployee ?? payrollRecord.pfEmployee);
  const eps = toNumber(payrollRecord.eps ?? payrollRecord.epsEmployer ?? payrollRecord.pfPension);
  const employerEpf = toNumber(payrollRecord.employerEpf ?? payrollRecord.epfEmployer ?? payrollRecord.employerPf);
  const employerEps = toNumber(payrollRecord.employerEps ?? payrollRecord.epsEmployer ?? payrollRecord.employerPension);

  if (basic + da <= 15000 && !pfEnabled) {
    violations.push({
      type: 'PF Eligibility',
      severity: 'High',
      message: 'PF-eligible employee is not marked as PF enabled.',
      recommendedFix: 'Enable PF for the employee and backfill missing deductions.',
    });
  }

  if (pfWage && !withinTolerance(pfWage, basic + da)) {
    violations.push({
      type: 'PF Wage Mismatch',
      severity: 'Medium',
      message: `PF wage should match Basic + DA (₹${basic + da}).`,
      recommendedFix: 'Align PF wage with Basic + DA in payroll settings.',
    });
  }

  const expectedEpf = pfWage * 0.12;
  if (pfWage && !withinTolerance(epf, expectedEpf)) {
    violations.push({
      type: 'EPF Contribution Mismatch',
      severity: 'High',
      message: 'Employee EPF contribution does not match 12% of PF wage.',
      recommendedFix: 'Recalculate EPF contribution at 12% of PF wage.',
    });
  }

  const epsCap = Math.min(pfWage, 15000);
  const expectedEps = epsCap * 0.0833;
  if (eps && !withinTolerance(eps, expectedEps)) {
    violations.push({
      type: 'EPS Cap Violation',
      severity: 'Medium',
      message: 'EPS contribution exceeds the statutory cap based on ₹15k wage ceiling.',
      recommendedFix: 'Cap EPS contributions at 8.33% of ₹15,000 (or PF wage, whichever is lower).',
    });
  }

  const expectedEmployerTotal = pfWage * 0.12;
  if (pfWage && !withinTolerance(employerEpf + employerEps, expectedEmployerTotal)) {
    violations.push({
      type: 'Employer PF Split Mismatch',
      severity: 'High',
      message: 'Employer EPF + EPS total does not equal 12% of PF wage.',
      recommendedFix: 'Split employer PF contributions to total 12% of PF wage.',
    });
  }

  return violations;
};

export default runPfRules;
