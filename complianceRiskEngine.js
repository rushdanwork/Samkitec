import {
  calculateRiskScore,
  getRiskLevel,
  normalizeInputData,
} from './backend/complianceEngine.js';
import runPfRules from './backend/complianceRules/pfRules.js';
import runEsiRules from './backend/complianceRules/esiRules.js';
import runPtRules from './backend/complianceRules/ptRules.js';
import runTdsRules from './backend/complianceRules/tdsRules.js';
import runWageRules from './backend/complianceRules/wageRules.js';
import runAttendanceFraudRules from './backend/complianceRules/attendanceFraudRules.js';
import runOvertimeRules from './backend/complianceRules/overtimeRules.js';
import runSalaryAnomalyRules from './backend/complianceRules/salaryAnomalyRules.js';

const COLLECTIONS = {
  employees: 'employees',
  attendance: 'attendanceRecords',
  payroll: 'payrollRecords',
  stateRules: 'stateRules',
  complianceResults: 'complianceResults',
  complianceViolationsLegacy: 'complianceViolations',
  complianceEvents: 'complianceEvents',
};

const scanState = {
  inProgress: false,
  pendingRunId: null,
};

const ensureFirebaseReady = () => Boolean(window.firebaseDb && window.firestoreFunctions);
const toLowerSeverity = (value = 'Low') => String(value).trim().toLowerCase();
const severityRank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeMonthInput = (monthInput, payrollRuns = []) => {
  if (!monthInput) return null;
  const monthValue = String(monthInput).trim();

  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue)) return monthValue;

  const runMatch = payrollRuns.find((run) => run.id === monthValue || run.runId === monthValue);
  if (runMatch?.month && runMatch?.year) {
    const monthNumber = Number(runMatch.month);
    const monthText = Number.isFinite(monthNumber)
      ? String(monthNumber).padStart(2, '0')
      : String(runMatch.month).slice(0, 2).padStart(2, '0');
    return `${runMatch.year}-${monthText}`;
  }

  return monthValue;
};

const getEmployeeId = (employee = {}) => employee.employeeId || employee.id || employee.uid || null;

const getEmployeeName = (employee = {}) => employee.name || employee.employeeName || employee.fullName || 'Unknown';

const buildViolation = ({
  ruleId,
  employee,
  severity = 'MEDIUM',
  description,
  expected,
  actual,
  impact,
  error,
}) => ({
  ruleId,
  employeeId: getEmployeeId(employee),
  employeeName: getEmployeeName(employee),
  severity,
  description,
  expected,
  actual,
  impact,
  status: 'OPEN',
  ...(error ? { error } : {}),
});

const checkPfRule = ({ employee, payrollRecord }) => {
  if (!employee?.pfApplicable) return null;
  if (!payrollRecord) {
    return buildViolation({
      ruleId: 'PF_MISSING',
      employee,
      severity: 'HIGH',
      description: 'Payroll record not found; PF contribution cannot be verified.',
      expected: 'PF deduction should be >= 12% of basic salary.',
      actual: 'No payroll record',
      impact: 'Potential PF non-compliance risk.',
    });
  }

  const basicSalary = toNumber(payrollRecord.basicSalary);
  const pfDeduction = toNumber(payrollRecord.pf || payrollRecord.pfDeduction || payrollRecord.deductionsPF);
  const requiredPf = basicSalary * 0.12;
  if (pfDeduction + 0.01 >= requiredPf) return null;

  return buildViolation({
    ruleId: 'PF_SHORT_DEDUCTION',
    employee,
    severity: 'HIGH',
    description: 'PF deduction is missing or below the required threshold.',
    expected: `>= ${requiredPf.toFixed(2)}`,
    actual: pfDeduction.toFixed(2),
    impact: 'Under-deduction can trigger statutory penalties.',
  });
};

const checkEsiRule = ({ employee, payrollRecord }) => {
  if (!employee?.esiApplicable) return null;
  if (!payrollRecord) {
    return buildViolation({
      ruleId: 'ESI_MISSING',
      employee,
      severity: 'HIGH',
      description: 'Payroll record not found; ESI deduction cannot be verified.',
      expected: 'ESI deduction should exist for eligible employee.',
      actual: 'No payroll record',
      impact: 'Potential ESI non-compliance risk.',
    });
  }

  const esiDeduction = toNumber(payrollRecord.esi || payrollRecord.esiDeduction || payrollRecord.deductionsESI);
  if (esiDeduction > 0) return null;

  return buildViolation({
    ruleId: 'ESI_NOT_DEDUCTED',
    employee,
    severity: 'HIGH',
    description: 'ESI is applicable but no ESI deduction was found in payroll.',
    expected: '> 0 ESI deduction',
    actual: esiDeduction,
    impact: 'May result in ESI filing failure or back charges.',
  });
};

const checkNetPayMismatchRule = ({ employee, payrollRecord }) => {
  if (!payrollRecord) return null;
  const earnings = toNumber(payrollRecord.basicSalary) + toNumber(payrollRecord.allowances) + toNumber(payrollRecord.earnings);
  const deductions = toNumber(payrollRecord.deductions);
  const net = toNumber(payrollRecord.netSalary || payrollRecord.netPay);
  const expectedNet = earnings - deductions;

  if (Math.abs(expectedNet - net) < 0.5) return null;

  return buildViolation({
    ruleId: 'NET_PAY_MISMATCH',
    employee,
    severity: 'CRITICAL',
    description: 'Net pay does not match earnings minus deductions.',
    expected: expectedNet.toFixed(2),
    actual: net.toFixed(2),
    impact: 'Direct payroll inaccuracy affecting employee compensation.',
  });
};

const checkSalaryPaidForAbsentDaysRule = ({ employee, payrollRecord, attendanceSummary }) => {
  if (!payrollRecord || !attendanceSummary) return null;
  const absentDays = toNumber(attendanceSummary.absent);
  const paidDays = toNumber(payrollRecord.paidDays || attendanceSummary.present);
  const workingDays = toNumber(payrollRecord.workingDays || attendanceSummary.workingDays);

  if (!absentDays || paidDays < workingDays) return null;

  return buildViolation({
    ruleId: 'SALARY_FOR_ABSENT_DAYS',
    employee,
    severity: 'HIGH',
    description: 'Employee appears fully paid despite absent days.',
    expected: 'Paid days should reduce when absent days exist.',
    actual: `absent=${absentDays}, paidDays=${paidDays}, workingDays=${workingDays}`,
    impact: 'Overpayment risk and policy breach.',
  });
};

const checkAttendanceVsWorkingDaysRule = ({ employee, attendanceSummary, payrollRecord }) => {
  const presentDays = toNumber(attendanceSummary?.present);
  const workingDays = toNumber(attendanceSummary?.workingDays || payrollRecord?.workingDays);
  if (!workingDays || presentDays <= workingDays) return null;

  return buildViolation({
    ruleId: 'ATTENDANCE_GT_WORKING_DAYS',
    employee,
    severity: 'MEDIUM',
    description: 'Attendance present days are greater than working days.',
    expected: `<= ${workingDays}`,
    actual: presentDays,
    impact: 'Potential attendance data integrity issue.',
  });
};

const checkMissingStatutoryInfoRule = ({ employee }) => {
  const missing = [];
  if (!employee?.pan && !employee?.panNumber) missing.push('PAN');
  if (!employee?.bankAccount && !employee?.bankAccountNumber) missing.push('Bank Account');
  if (!employee?.ifsc) missing.push('IFSC');
  if (!employee?.pfApplicable && !employee?.esiApplicable) return null;
  if (!missing.length) return null;

  return buildViolation({
    ruleId: 'MISSING_STATUTORY_INFO',
    employee,
    severity: 'MEDIUM',
    description: 'Employee master data is missing required statutory/banking fields.',
    expected: 'PAN, Bank Account and IFSC should be present.',
    actual: missing.join(', '),
    impact: 'Can block statutory filing or payout.',
  });
};

const summarizeAttendanceByEmployeeForMonth = (records = {}, monthKey) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  const result = new Map();

  Object.entries(records).forEach(([dateKey, dayRecord]) => {
    const date = new Date(dateKey);
    if (Number.isNaN(date.getTime())) return;
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) return;

    const items = dayRecord?.records || {};
    Object.entries(items).forEach(([employeeId, statusObj]) => {
      const status = String(statusObj?.status || '').toLowerCase();
      const current = result.get(employeeId) || { present: 0, absent: 0, leave: 0, workingDays: 0 };
      if (['present', 'late', 'halfday'].includes(status)) current.present += status === 'halfday' ? 0.5 : 1;
      if (status === 'absent') current.absent += 1;
      if (status === 'leave') current.leave += 1;
      if (status) current.workingDays += 1;
      result.set(employeeId, current);
    });
  });

  return result;
};

const buildPayrollByEmployeeForMonth = (payrollRuns = [], monthKey) => {
  const byEmployee = new Map();
  payrollRuns
    .filter((run) => normalizeMonthInput(run.id, payrollRuns) === monthKey || normalizeMonthInput(`${run.year}-${String(run.month).padStart(2, '0')}`) === monthKey)
    .forEach((run) => {
      (run.payrollData || []).forEach((item) => {
        if (item?.employeeId) byEmployee.set(item.employeeId, item);
      });
    });
  return byEmployee;
};

const deleteExistingComplianceEventsForMonth = async (db, monthKey) => {
  const { collection, getDocs, query, where, writeBatch } = window.firestoreFunctions;
  const snapshot = await getDocs(query(collection(db, COLLECTIONS.complianceEvents), where('scanMonth', '==', monthKey)));
  if (snapshot.empty) return;

  let batch = writeBatch(db);
  let operationCount = 0;

  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    operationCount += 1;
    if (operationCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      operationCount = 0;
    }
  }

  if (operationCount > 0) await batch.commit();
};

const fetchCollectionAsArray = async (db, collectionName) => {
  const { collection, getDocs } = window.firestoreFunctions;
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const fetchAttendanceAsObject = async (db) => {
  const { collection, getDocs } = window.firestoreFunctions;
  const snapshot = await getDocs(collection(db, COLLECTIONS.attendance));
  const records = {};
  snapshot.forEach((docSnap) => {
    records[docSnap.id] = docSnap.data();
  });
  return records;
};

const fetchStateRulesAsObject = async (db) => {
  const { collection, getDocs } = window.firestoreFunctions;
  const snapshot = await getDocs(collection(db, COLLECTIONS.stateRules));
  const stateRules = {};
  snapshot.forEach((docSnap) => {
    stateRules[docSnap.id] = docSnap.data();
  });
  return stateRules;
};

const mapRuleResult = (violations = []) => {
  const normalizedViolations = Array.isArray(violations) ? violations : [];
  const passed = normalizedViolations.length === 0;
  const highest = normalizedViolations.reduce((acc, violation) => {
    const severity = toLowerSeverity(violation.severity);
    if (severity === 'high') return 'high';
    if (severity === 'medium' && acc !== 'high') return 'medium';
    return acc;
  }, 'low');

  return {
    passed,
    severity: passed ? 'low' : highest,
    reason: passed
      ? 'Rule passed without violations.'
      : normalizedViolations.map((violation) => violation.message || violation.type || 'Rule triggered').join(' | '),
    expected: passed ? 'No violations expected.' : normalizedViolations.map((violation) => violation.type),
    actual: passed ? [] : normalizedViolations,
  };
};

const buildEmployeeRuleResults = ({ employee, payrollRecord, payrollHistory, attendanceSummary, stateRules }) => {
  const pfViolations = runPfRules({ employee, payrollRecord });
  const esiViolations = runEsiRules({ employee, payrollRecord });
  const tdsViolations = runTdsRules({ employee, payrollRecord });
  const ptViolations = runPtRules({ employee, payrollRecord, stateRules });
  const minWageViolations = runWageRules({ employee, stateRules });
  const attendanceViolations = [
    ...runAttendanceFraudRules({ attendanceSummary }),
    ...runOvertimeRules({ attendanceSummary }),
  ];
  const salaryAnomalyViolations = runSalaryAnomalyRules({ payrollHistory, payrollRecord, employee });

  const allViolations = [
    ...pfViolations,
    ...esiViolations,
    ...tdsViolations,
    ...ptViolations,
    ...minWageViolations,
    ...attendanceViolations,
    ...salaryAnomalyViolations,
  ];

  return {
    allViolations,
    rules: {
      pf: mapRuleResult(pfViolations),
      esi: mapRuleResult(esiViolations),
      tds: mapRuleResult(tdsViolations),
      pt: mapRuleResult(ptViolations),
      minWage: mapRuleResult(minWageViolations),
      attendance: mapRuleResult(attendanceViolations),
      salaryAnomaly: mapRuleResult(salaryAnomalyViolations),
    },
  };
};

const writeEmployeeComplianceResult = async ({ db, runId, employeeId, summary, rules }) => {
  const { doc, setDoc, serverTimestamp } = window.firestoreFunctions;
  const summaryRef = doc(db, COLLECTIONS.complianceResults, runId, employeeId, 'summary');
  const rulesRef = doc(db, COLLECTIONS.complianceResults, runId, employeeId, 'rules');

  try {
    await Promise.all([
      setDoc(summaryRef, { ...summary, firestoreTimestamp: serverTimestamp() }, { merge: true }),
      setDoc(rulesRef, { ...rules, updatedAt: serverTimestamp() }, { merge: true }),
    ]);
  } catch (error) {
    console.error('[ComplianceEngine] Firestore write failed.', { runId, employeeId, error });
    throw error;
  }
};

const writeLegacySummary = async ({ db, employeeId, summary, allViolations }) => {
  const { doc, setDoc, serverTimestamp } = window.firestoreFunctions;
  const summaryRef = doc(db, COLLECTIONS.complianceViolationsLegacy, employeeId);
  const violationsRef = doc(db, COLLECTIONS.complianceViolationsLegacy, employeeId, 'violations', 'list');

  await Promise.all([
    setDoc(
      summaryRef,
      {
        summary: {
          employeeId,
          riskScore: summary.riskScore,
          riskLevel: summary.severity,
          lastEvaluated: serverTimestamp(),
          lastEvaluatedIso: summary.timestamp,
          violationCount: summary.violationCount,
        },
        topViolations: allViolations.slice(0, 8),
      },
      { merge: true }
    ),
    setDoc(violationsRef, { list: allViolations, updatedAt: serverTimestamp() }, { merge: true }),
  ]);
};

function resolveRunId(runIdArg = null) {
  if (runIdArg) return runIdArg;

  if (window.__latestRunId) return window.__latestRunId;

  const payrollRuns = JSON.parse(localStorage.getItem('payrollRuns')) || [];
  if (payrollRuns.length === 0) return null;

  const latest = payrollRuns[payrollRuns.length - 1];
  return latest.id || latest.runId;
}

const runComplianceScan = async (runIdMaybe = 'manual') => {
  if (!ensureFirebaseReady()) return null;
  if (scanState.inProgress) {
    scanState.pendingRunId = runIdMaybe;
    return null;
  }

  const db = window.firebaseDb;
  const { collection, doc, getDoc, setDoc, serverTimestamp, writeBatch } = window.firestoreFunctions;

  scanState.inProgress = true;

  try {
    const monthArg = runIdMaybe && !['manual', 'auto', 'payrollCompletedEvent'].includes(runIdMaybe)
      ? runIdMaybe
      : resolveRunId(null);

    const [employeesFromDb, attendanceRecords, payrollRuns] = await Promise.all([
      Array.isArray(window.employees) && window.employees.length
        ? Promise.resolve(window.employees)
        : fetchCollectionAsArray(db, COLLECTIONS.employees),
      fetchAttendanceAsObject(db),
      fetchCollectionAsArray(db, COLLECTIONS.payroll),
    ]);

    const monthKey = normalizeMonthInput(monthArg, payrollRuns);
    if (!monthKey) {
      console.warn('[ComplianceEngine] No month or payroll run available to scan.');
      return null;
    }

    const employees = employeesFromDb.filter((employee) => getEmployeeId(employee));
    const attendanceByEmployee = summarizeAttendanceByEmployeeForMonth(attendanceRecords, monthKey);
    const payrollByEmployee = buildPayrollByEmployeeForMonth(payrollRuns, monthKey);

    console.info('[ComplianceEngine] Scan started.', { month: monthKey, employeeCount: employees.length });

    const violations = [];

    employees.forEach((employee) => {
      const employeeId = getEmployeeId(employee);
      const payrollRecord = payrollByEmployee.get(employeeId);
      const attendanceSummary = attendanceByEmployee.get(employeeId);

      if (!payrollRecord) {
        violations.push(
          buildViolation({
            ruleId: 'PAYROLL_MISSING',
            employee,
            severity: 'CRITICAL',
            description: `No payroll record found for ${monthKey}.`,
            expected: `Payroll record for ${monthKey}`,
            actual: 'Missing',
            impact: 'Employee excluded from payroll output.',
          })
        );
      }

      if (!attendanceSummary) {
        violations.push(
          buildViolation({
            ruleId: 'ATTENDANCE_MISSING',
            employee,
            severity: 'HIGH',
            description: `No attendance data found for ${monthKey}.`,
            expected: `Attendance records for ${monthKey}`,
            actual: 'Missing',
            impact: 'Attendance dependent compliance checks are incomplete.',
          })
        );
      }

      const checks = [
        checkPfRule({ employee, payrollRecord }),
        checkEsiRule({ employee, payrollRecord }),
        checkNetPayMismatchRule({ employee, payrollRecord }),
        checkSalaryPaidForAbsentDaysRule({ employee, payrollRecord, attendanceSummary }),
        checkAttendanceVsWorkingDaysRule({ employee, payrollRecord, attendanceSummary }),
        checkMissingStatutoryInfoRule({ employee }),
      ].filter(Boolean);

      checks.forEach((item) => violations.push(item));
    });

    await deleteExistingComplianceEventsForMonth(db, monthKey);

    if (violations.length) {
      let batch = writeBatch(db);
      let ops = 0;
      for (const violation of violations) {
        const docId = `${monthKey}_${violation.employeeId}_${violation.ruleId}`;
        batch.set(doc(collection(db, COLLECTIONS.complianceEvents), docId), {
          ...violation,
          scanMonth: monthKey,
          createdAt: serverTimestamp(),
        });
        ops += 1;
        if (ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }

    window.dispatchEvent(
      new CustomEvent('complianceScanCompleted', {
        detail: { month: monthKey, employeesEvaluated: employees.length, violationCount: violations.length },
      })
    );

    console.info('[ComplianceEngine] Scan completed.', {
      month: monthKey,
      employeesEvaluated: employees.length,
      violationCount: violations.length,
    });

    return {
      month: monthKey,
      generatedAt: new Date().toISOString(),
      violations,
    };
  } catch (error) {
    console.error('[ComplianceEngine] Failed to run compliance scan:', error);
    return null;
  } finally {
    scanState.inProgress = false;
    if (scanState.pendingRunId) {
      const nextRunId = scanState.pendingRunId;
      scanState.pendingRunId = null;
      window.setTimeout(() => {
        runComplianceScan(nextRunId);
      }, 400);
    }
  }
};


const runComplianceScanTest = async ({ month, expectedByEmployee = [] } = {}) => {
  const result = await runComplianceScan(month || 'manual');
  if (!result) {
    return { passed: false, month: month || null, mismatches: expectedByEmployee, message: 'Scan failed.' };
  }

  const byEmployee = new Map();
  result.violations.forEach((violation) => {
    const item = byEmployee.get(violation.employeeId) || { count: 0 };
    item.count += 1;
    byEmployee.set(violation.employeeId, item);
  });
  const mismatches = [];

  expectedByEmployee.forEach((expectation) => {
    const current = byEmployee.get(expectation.employeeId);
    if (!current) {
      mismatches.push({ employeeId: expectation.employeeId, reason: 'missing_employee' });
      return;
    }
    if (Number.isFinite(expectation.maxViolations) && current.count > expectation.maxViolations) {
      mismatches.push({
        employeeId: expectation.employeeId,
        reason: 'violation_count_exceeded',
        expected: expectation.maxViolations,
        actual: current.count,
      });
    }
  });

  return {
    passed: mismatches.length === 0,
    month: result.month,
    generatedAt: result.generatedAt,
    mismatches,
  };
};

window.runComplianceScanTest = runComplianceScanTest;

window.runComplianceScan = runComplianceScan;
window.addEventListener('payrollRunCompleted', (event) => {
  const runId = event?.detail?.runId || event?.detail?.payrollRunId;
  if (runId) runComplianceScan(runId);
});
