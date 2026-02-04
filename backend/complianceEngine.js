import runPfRules from './complianceRules/pfRules.js';
import runEsiRules from './complianceRules/esiRules.js';
import runPtRules from './complianceRules/ptRules.js';
import runTdsRules from './complianceRules/tdsRules.js';
import runWageRules from './complianceRules/wageRules.js';
import runAttendanceFraudRules from './complianceRules/attendanceFraudRules.js';
import runOvertimeRules from './complianceRules/overtimeRules.js';
import runSalaryAnomalyRules from './complianceRules/salaryAnomalyRules.js';

const SEVERITY_POINTS = {
  Low: 10,
  Medium: 25,
  High: 40,
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toDateValue = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeEmployees = (employees = []) =>
  (Array.isArray(employees) ? employees : Object.values(employees || {})).map((employee) => ({
    employeeId: employee.employeeId ?? employee.id,
    ...employee,
  }));

const normalizeAttendance = (attendanceRecords = {}) => {
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
      entry.overtimeHours += toNumber(record?.overtimeHours ?? record?.otHours ?? 0);
      if (record?.deviceId) entry.devices.add(record.deviceId);
      if (record?.ipAddress) entry.ipAddresses.add(record.ipAddress);
      entry.daily.push({ dateKey, ...record });
      summary.set(employeeId, entry);
    });
  });
  return summary;
};

const normalizePayroll = (payrollRuns = []) => {
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

  grouped.forEach((list) => {
    list.sort((a, b) => toDateValue(a.paymentDate ?? a.processedAt ?? a.createdAt) - toDateValue(b.paymentDate ?? b.processedAt ?? b.createdAt));
  });

  return grouped;
};

export const normalizeInputData = (employees, attendanceRecords, payrollRuns, stateRules = {}) => {
  const normalizedEmployees = normalizeEmployees(employees);
  const attendanceByEmployee = normalizeAttendance(attendanceRecords);
  const payrollByEmployee = normalizePayroll(payrollRuns);
  return {
    employees: normalizedEmployees,
    attendanceByEmployee,
    payrollByEmployee,
    stateRules: stateRules || {},
  };
};

export const calculateRiskScore = (violations = []) => {
  const total = violations.reduce((sum, violation) => sum + (SEVERITY_POINTS[violation.severity] || 0), 0);
  return Math.min(100, total);
};

export const getRiskLevel = (score) => {
  if (score >= 70) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
};

const buildComplianceReport = ({ employee, payrollRecord, payrollHistory, attendanceSummary, stateRules }) => {
  const violations = [
    ...runPfRules({ employee, payrollRecord }),
    ...runEsiRules({ employee, payrollRecord }),
    ...runPtRules({ employee, payrollRecord, stateRules }),
    ...runTdsRules({ employee, payrollRecord }),
    ...runWageRules({ employee, stateRules }),
    ...runAttendanceFraudRules({ attendanceSummary }),
    ...runOvertimeRules({ attendanceSummary }),
    ...runSalaryAnomalyRules({ payrollHistory, payrollRecord, employee }),
  ];

  const riskScore = calculateRiskScore(violations);
  const riskLevel = getRiskLevel(riskScore);

  return {
    employeeId: employee.employeeId,
    employeeName: employee.name ?? employee.employeeName ?? 'Unknown',
    riskScore,
    riskLevel,
    violations,
  };
};

export const runComplianceEngine = (employees = [], attendanceRecords = {}, payrollRuns = [], stateRules = {}) => {
  const { employees: normalizedEmployees, attendanceByEmployee, payrollByEmployee, stateRules: normalizedStateRules } =
    normalizeInputData(employees, attendanceRecords, payrollRuns, stateRules);

  const results = normalizedEmployees
    .map((employee) => {
      if (!employee.employeeId) return null;
      const payrollHistory = payrollByEmployee.get(employee.employeeId) || [];
      const payrollRecord = payrollHistory.length ? payrollHistory[payrollHistory.length - 1] : {};
      const attendanceSummary = attendanceByEmployee.get(employee.employeeId) || {};

      return buildComplianceReport({
        employee,
        payrollRecord,
        payrollHistory,
        attendanceSummary,
        stateRules: normalizedStateRules,
      });
    })
    .filter(Boolean);

  return {
    results,
    generatedAt: new Date().toISOString(),
  };
};

export default runComplianceEngine;
