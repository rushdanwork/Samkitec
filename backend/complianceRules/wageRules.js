const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const runWageRules = ({ employee = {}, stateRules = {} }) => {
  const violations = [];
  const jobRole = employee.jobRole ?? employee.role ?? employee.designation;
  const minWages = stateRules.minWages || {};
  const minimum = toNumber(minWages?.[jobRole] ?? minWages?.default ?? 0);
  const basic = toNumber(employee.basic ?? employee.basicSalary ?? 0);

  if (minimum > 0 && basic < minimum) {
    violations.push({
      type: 'Minimum Wage Violation',
      severity: 'High',
      message: `Basic pay ₹${basic} is below minimum wage ₹${minimum} for ${jobRole || 'role'}.`,
      recommendedFix: 'Update basic salary to meet the minimum wage requirement.',
    });
  }

  return violations;
};

export default runWageRules;
