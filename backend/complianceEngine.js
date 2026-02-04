const SEVERITY_POINTS = {
  Low: 10,
  Medium: 20,
  High: 35,
};

const clampNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildViolation = ({ type, severity, message, recommendedFix }) => ({
  type,
  severity,
  message,
  recommendedFix,
});

const getMonthlyGross = (record) =>
  clampNumber(record?.gross ?? record?.monthlyGross ?? record?.totalEarnings ?? record?.netSalary ?? 0);

const getBasicPay = (record, employee) =>
  clampNumber(record?.basic ?? record?.basicSalary ?? employee?.basicSalary ?? employee?.basic ?? 0);

const getPayrollByEmployee = (payrollRuns = []) => {
  const records = Array.isArray(payrollRuns) ? payrollRuns : Object.values(payrollRuns || {});
  const flattened = records.flatMap((entry) => {
    if (Array.isArray(entry?.payrollData)) return entry.payrollData;
    if (Array.isArray(entry?.records)) return entry.records;
    return entry ? [entry] : [];
  });

  const grouped = new Map();
  flattened.forEach((record) => {
    const employeeId = record?.employeeId ?? record?.empId ?? record?.id;
    if (!employeeId) return;
    const list = grouped.get(employeeId) || [];
    list.push({ ...record, employeeId });
    grouped.set(employeeId, list);
  });

  grouped.forEach((list, key) => {
    list.sort((a, b) => {
      const aDate = new Date(a.paymentDate ?? a.processedAt ?? a.createdAt ?? 0).getTime();
      const bDate = new Date(b.paymentDate ?? b.processedAt ?? b.createdAt ?? 0).getTime();
      return aDate - bDate;
    });
  });

  return grouped;
};

const getAttendanceByEmployee = (attendanceRecords = {}) => {
  const summary = new Map();
  Object.entries(attendanceRecords || {}).forEach(([dateKey, dayRecords]) => {
    Object.entries(dayRecords || {}).forEach(([employeeId, record]) => {
      const entry = summary.get(employeeId) || {
        totalDays: 0,
        presentDays: 0,
        overtimeHours: 0,
        devices: new Set(),
        ipAddresses: new Set(),
        daily: [],
      };
      entry.totalDays += 1;
      if (['present', 'late', 'halfday'].includes(record?.status)) {
        entry.presentDays += 1;
      }
      entry.overtimeHours += clampNumber(record?.overtimeHours ?? record?.otHours ?? 0);
      if (record?.deviceId) entry.devices.add(record.deviceId);
      if (record?.ipAddress) entry.ipAddresses.add(record.ipAddress);
      entry.daily.push({ dateKey, ...record });
      summary.set(employeeId, entry);
    });
  });
  return summary;
};

export const checkPFViolation = ({ employee, payrollRecord }) => {
  const basic = getBasicPay(payrollRecord, employee);
  const pfDeduction = clampNumber(payrollRecord?.pf ?? payrollRecord?.pfDeduction ?? 0);
  if (basic <= 15000 && pfDeduction === 0) {
    return buildViolation({
      type: 'PF Violation',
      severity: 'High',
      message: 'PF-eligible employee missing mandatory PF deduction.',
      recommendedFix: 'Enable PF deduction for this employee and backfill the missed contribution.',
    });
  }
  return null;
};

export const checkESIViolation = ({ employee, payrollRecord }) => {
  const gross = getMonthlyGross(payrollRecord);
  const esiDeduction = clampNumber(payrollRecord?.esi ?? payrollRecord?.esiDeduction ?? 0);
  if (gross > 0 && gross <= 21000 && esiDeduction === 0) {
    return buildViolation({
      type: 'ESI Violation',
      severity: 'High',
      message: 'ESI-eligible employee has no ESI deduction recorded.',
      recommendedFix: 'Recalculate ESI eligibility and apply statutory deductions for this cycle.',
    });
  }
  return null;
};

export const checkPTMismatch = ({ employee, payrollRecord, stateRules }) => {
  const state = employee?.state ?? employee?.workState ?? payrollRecord?.state;
  const slabs = stateRules?.ptSlabs?.[state] || stateRules?.ptSlabs?.default || [];
  const gross = getMonthlyGross(payrollRecord);
  const ptDeduction = clampNumber(payrollRecord?.pt ?? payrollRecord?.ptDeduction ?? 0);
  const expected = slabs.find((slab) => gross >= slab.min && gross <= slab.max);

  if (expected && ptDeduction !== clampNumber(expected.amount)) {
    return buildViolation({
      type: 'PT Mismatch',
      severity: 'Medium',
      message: `Professional tax mismatch for ${state || 'state'} slab. Expected ₹${expected.amount}.`,
      recommendedFix: 'Update PT deduction to match the state slab and review month exceptions.',
    });
  }
  return null;
};

export const checkMinimumWage = ({ employee, payrollRecord, stateRules }) => {
  const state = employee?.state ?? employee?.workState ?? payrollRecord?.state;
  const minWage = clampNumber(stateRules?.minimumWage?.[state] ?? stateRules?.minimumWage?.default ?? 0);
  const basic = getBasicPay(payrollRecord, employee);
  if (minWage && basic < minWage) {
    return buildViolation({
      type: 'Minimum Wage Violation',
      severity: 'High',
      message: `Basic pay ₹${basic} below minimum wage ₹${minWage} for ${state || 'state'}.`,
      recommendedFix: 'Increase basic pay to meet or exceed the notified minimum wage.',
    });
  }
  return null;
};

export const checkTDSRules = ({ employee, payrollRecord }) => {
  const gross = getMonthlyGross(payrollRecord);
  const tdsDeduction = clampNumber(payrollRecord?.tds ?? payrollRecord?.tdsDeduction ?? 0);
  const pan = employee?.pan ?? employee?.panNumber;
  if (gross >= 50000 && tdsDeduction === 0) {
    return buildViolation({
      type: 'TDS/PAN Rule Violation',
      severity: pan ? 'Medium' : 'High',
      message: pan
        ? 'High earnings but no TDS deduction recorded.'
        : 'High earnings with missing PAN and no TDS deduction.',
      recommendedFix: pan
        ? 'Review declarations and apply monthly TDS based on annual projection.'
        : 'Collect PAN immediately and apply higher TDS until PAN is verified.',
    });
  }
  return null;
};

export const detectAttendanceFraud = ({ attendanceSummary, deviceUsage, ipUsage }) => {
  const deviceFlag = Array.from(attendanceSummary?.devices || []).some(
    (deviceId) => (deviceUsage.get(deviceId) || 0) >= 3
  );
  const ipFlag = Array.from(attendanceSummary?.ipAddresses || []).some(
    (ip) => (ipUsage.get(ip) || 0) >= 5
  );

  if (deviceFlag || ipFlag) {
    return buildViolation({
      type: 'Attendance Fraud',
      severity: 'Medium',
      message: 'Shared device/IP detected for multiple employees during check-in.',
      recommendedFix: 'Verify device/IP sharing and enforce device-specific check-ins.',
    });
  }
  return null;
};

export const detectOvertimeViolation = ({ attendanceSummary }) => {
  const overtimeHours = clampNumber(attendanceSummary?.overtimeHours ?? 0);
  if (overtimeHours >= 60) {
    return buildViolation({
      type: 'Overtime Violation',
      severity: 'High',
      message: `Overtime logged at ${overtimeHours} hours, exceeding statutory limits.`,
      recommendedFix: 'Redistribute shifts and cap overtime to stay within legal limits.',
    });
  }
  if (overtimeHours >= 40) {
    return buildViolation({
      type: 'Overtime Violation',
      severity: 'Medium',
      message: `Overtime trending high at ${overtimeHours} hours this period.`,
      recommendedFix: 'Monitor overtime approvals and document compensatory off where needed.',
    });
  }
  return null;
};

export const detectSalaryAnomaly = ({ payrollHistory, payrollRecord, employee }) => {
  const gross = getMonthlyGross(payrollRecord);
  const basic = getBasicPay(payrollRecord, employee);
  const recent = (payrollHistory || []).slice(-4, -1);
  const average = recent.length
    ? recent.reduce((sum, record) => sum + getMonthlyGross(record), 0) / recent.length
    : 0;

  if (average && gross > average * 1.3) {
    return buildViolation({
      type: 'Salary Spike',
      severity: 'High',
      message: `Sudden salary spike detected: ₹${gross} vs ₹${average.toFixed(0)} average.`,
      recommendedFix: 'Validate incentives/bonus payouts and confirm approvals for the spike.',
    });
  }

  if (gross > 0 && basic / gross < 0.35) {
    return buildViolation({
      type: 'Salary Structure Anomaly',
      severity: 'Medium',
      message: 'Basic pay is below 35% of gross salary, indicating a structure anomaly.',
      recommendedFix: 'Rebalance salary components to keep basic pay within statutory norms.',
    });
  }

  return null;
};

export const calculateRiskScore = (violations = []) => {
  const total = violations.reduce((sum, violation) => sum + (SEVERITY_POINTS[violation.severity] || 0), 0);
  return Math.min(100, total);
};

const deriveRiskLevel = (score) => {
  if (score <= 20) return 'Low';
  if (score <= 50) return 'Medium';
  return 'High';
};

export const runComplianceEngine = (employees = [], attendanceRecords = {}, payrollRuns = [], stateRules = {}) => {
  const employeeList = Array.isArray(employees) ? employees : Object.values(employees || {});
  const payrollByEmployee = getPayrollByEmployee(payrollRuns);
  const attendanceByEmployee = getAttendanceByEmployee(attendanceRecords);

  const deviceUsage = new Map();
  const ipUsage = new Map();

  attendanceByEmployee.forEach((summary) => {
    summary.devices.forEach((deviceId) => {
      deviceUsage.set(deviceId, (deviceUsage.get(deviceId) || 0) + 1);
    });
    summary.ipAddresses.forEach((ip) => {
      ipUsage.set(ip, (ipUsage.get(ip) || 0) + 1);
    });
  });

  const results = employeeList.map((employee) => {
    const employeeId = employee?.employeeId ?? employee?.id;
    if (!employeeId) return null;

    const payrollHistory = payrollByEmployee.get(employeeId) || [];
    const payrollRecord = payrollHistory.length ? payrollHistory[payrollHistory.length - 1] : null;
    const attendanceSummary = attendanceByEmployee.get(employeeId) || {};

    const violations = [
      checkPFViolation({ employee, payrollRecord }),
      checkESIViolation({ employee, payrollRecord }),
      checkPTMismatch({ employee, payrollRecord, stateRules }),
      checkMinimumWage({ employee, payrollRecord, stateRules }),
      checkTDSRules({ employee, payrollRecord }),
      detectAttendanceFraud({ attendanceSummary, deviceUsage, ipUsage }),
      detectOvertimeViolation({ attendanceSummary }),
      detectSalaryAnomaly({ payrollHistory, payrollRecord, employee }),
    ].filter(Boolean);

    const riskScore = calculateRiskScore(violations);

    return {
      employeeId,
      employeeName: employee?.name ?? employee?.employeeName ?? 'Unknown',
      riskScore,
      riskLevel: deriveRiskLevel(riskScore),
      violations,
    };
  });

  return {
    results: results.filter(Boolean),
    generatedAt: new Date().toISOString(),
  };
};

export default runComplianceEngine;
