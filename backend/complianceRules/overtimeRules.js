const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const runOvertimeRules = ({ attendanceSummary = {} }) => {
  const violations = [];
  const daily = attendanceSummary.daily || [];
  const overtimeHours = toNumber(attendanceSummary.overtimeHours ?? 0);

  const exceededDaily = daily.some((record) => toNumber(record.overtimeHours ?? record.otHours ?? 0) > 2);
  if (exceededDaily) {
    violations.push({
      type: 'Daily Overtime Limit',
      severity: 'Medium',
      message: 'Overtime exceeds 2 hours on one or more days.',
      recommendedFix: 'Cap daily overtime to 2 hours and adjust staffing schedules.',
    });
  }

  if (overtimeHours > 50) {
    violations.push({
      type: 'Monthly Overtime Limit',
      severity: 'High',
      message: `Overtime reached ${overtimeHours} hours this month, exceeding 50-hour limit.`,
      recommendedFix: 'Review workload distribution to reduce total overtime hours.',
    });
  }

  return violations;
};

export default runOvertimeRules;
