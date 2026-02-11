import runComplianceEngine, { normalizeInputData } from './backend/complianceEngine.js';

const COLLECTIONS = {
  employees: 'employees',
  attendance: 'attendanceRecords',
  payroll: 'payrollRecords',
  stateRules: 'stateRules',
  complianceViolations: 'complianceViolations',
};

const engineState = {
  employees: [],
  attendanceRecords: {},
  payrollRuns: [],
  stateRules: {},
};

let runTimeout;
let subscriptions = [];
let scanInProgress = false;
let pendingReason = null;

const safeSerialize = (value) => {
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Set) return Array.from(value);
  if (Array.isArray(value)) return value.map((item) => safeSerialize(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, item]) => {
      acc[key] = safeSerialize(item);
      return acc;
    }, {});
  }
  return value;
};

const summarizeForLogs = (normalizedData, employeeId) => {
  const payrollHistory = normalizedData.payrollByEmployee.get(employeeId) || [];
  const attendanceSummary = normalizedData.attendanceByEmployee.get(employeeId) || {
    totalDays: 0,
    presentDays: 0,
    overtimeHours: 0,
    daily: [],
  };
  return {
    payrollHistoryCount: payrollHistory.length,
    payrollCurrentRecord: payrollHistory[payrollHistory.length - 1] || {},
    attendance: {
      totalDays: attendanceSummary.totalDays || 0,
      presentDays: attendanceSummary.presentDays || 0,
      overtimeHours: attendanceSummary.overtimeHours || 0,
      devices: Array.from(attendanceSummary.devices || []),
      ipAddresses: Array.from(attendanceSummary.ipAddresses || []),
      daily: attendanceSummary.daily || [],
    },
  };
};

const violationMessagesByType = {
  'PF Eligibility': 'PF-eligible employee is not marked as PF enabled.',
  'PF Wage Mismatch': 'PF wage should match Basic + DA.',
  'EPF Contribution Mismatch': 'Employee EPF contribution does not match 12% of PF wage.',
  'EPS Cap Violation': 'EPS contribution exceeds the statutory cap.',
  'Employer PF Split Mismatch': 'Employer EPF + EPS total does not equal 12% of PF wage.',
  'ESI Eligibility': 'ESI-eligible employee is not flagged for ESI coverage.',
  'ESI Contribution Mismatch': 'Employee ESI contribution does not match 0.75% of gross wages.',
  'ESI Employer Contribution Mismatch': 'Employer ESI contribution does not match 3.25% of gross wages.',
  'PT Missing': 'PT deduction missing for applicable slab.',
  'PT Slab Mismatch': 'PT deduction does not match configured slab.',
  'PT Deducted Twice': 'PT deduction appears to be applied more than once.',
  'PT Deduction Invalid State': 'PT deducted where no state slab is configured.',
  'TDS PAN Rule': 'PAN missing and TDS rate is below 20%.',
  'TDS Regime Mismatch': 'Payroll tax regime does not match employee declaration.',
  'TDS Tax Mismatch': 'Actual TDS deduction differs from expected calculation.',
  'TDS Declaration/Proof Mismatch': 'Declared deductions exceed proofs submitted.',
  'Minimum Wage Violation': 'Basic pay is below minimum wage for role.',
  'Attendance Device Cloning': 'Multiple device IDs detected for one employee.',
  'Attendance Timestamp Reuse': 'Identical timestamps repeated across attendance records.',
  'Impossible Travel': 'Check-ins show impossible travel between distant locations.',
  'Sudden Perfect Attendance': 'Perfect attendance detected after inconsistent history.',
  'Daily Overtime Limit': 'Overtime exceeds 2 hours on one or more days.',
  'Monthly Overtime Limit': 'Monthly overtime exceeds configured limit.',
  'Salary Spike': 'Gross salary increased by more than 40% vs recent average.',
  'Deduction Drop Anomaly': 'Deductions dropped sharply compared to recent periods.',
};

const normalizeViolation = (violation = {}) => ({
  type: violation.type || 'Unknown Rule',
  severity: violation.severity || 'Low',
  message: violation.message || violationMessagesByType[violation.type] || 'Compliance rule triggered.',
  recommendedFix: violation.recommendedFix || 'Review and apply the relevant compliance remediation.',
  ruleCode: violation.ruleCode || violation.type || 'UNKNOWN_RULE',
  triggeredAt: new Date().toISOString(),
});

const ensureFirebaseReady = () => Boolean(window.firebaseDb && window.firestoreFunctions);

const parseAttendanceSnapshot = (snapshot) => {
  const records = {};
  snapshot.forEach((docSnap) => {
    records[docSnap.id] = docSnap.data();
  });
  return records;
};

const parsePayrollSnapshot = (snapshot) =>
  snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

const parseStateRulesSnapshot = (snapshot) => {
  const rules = {};
  snapshot.forEach((docSnap) => {
    rules[docSnap.id] = docSnap.data();
  });
  return rules;
};

const scheduleComplianceRun = (reason = 'auto') => {
  if (!ensureFirebaseReady()) return;
  if (runTimeout) window.clearTimeout(runTimeout);
  runTimeout = window.setTimeout(() => runComplianceScan(reason), 800);
};

const runComplianceScan = async (reason = 'manual') => {
  if (!ensureFirebaseReady()) return null;
  if (scanInProgress) {
    pendingReason = reason;
    return null;
  }
  const { setDoc, doc, serverTimestamp } = window.firestoreFunctions;
  const db = window.firebaseDb;

  scanInProgress = true;

  try {
    console.info('[ComplianceEngine] Scan started.', {
      reason,
      employees: engineState.employees.length,
      attendanceDays: Object.keys(engineState.attendanceRecords || {}).length,
      payrollRuns: engineState.payrollRuns.length,
      stateRuleSets: Object.keys(engineState.stateRules || {}).length,
    });

    const normalizedData = normalizeInputData(
      engineState.employees,
      engineState.attendanceRecords,
      engineState.payrollRuns,
      engineState.stateRules
    );

    const engineResult = runComplianceEngine(
      engineState.employees,
      engineState.attendanceRecords,
      engineState.payrollRuns,
      engineState.stateRules
    );

    const saveTasks = engineResult.results.map((report) => {
      const normalizedViolations = (Array.isArray(report.violations) ? report.violations : []).map((violation) =>
        normalizeViolation(violation)
      );
      const debugPayload = summarizeForLogs(normalizedData, report.employeeId);

      console.debug('[ComplianceEngine] Evaluating employee for compliance.', {
        employeeId: report.employeeId,
        employeeName: report.employeeName,
        riskScore: report.riskScore,
        riskLevel: report.riskLevel,
        rawData: safeSerialize(debugPayload),
      });

      normalizedViolations.forEach((violation) => {
        console.info('[ComplianceEngine] Rule triggered.', {
          employeeId: report.employeeId,
          employeeName: report.employeeName,
          rule: violation.type,
          severity: violation.severity,
          reason: violation.message,
        });
      });

      const summaryObject = {
        summary: {
          employeeId: report.employeeId,
          employeeName: report.employeeName,
          riskScore: report.riskScore,
          riskLevel: report.riskLevel,
          lastEvaluated: serverTimestamp(),
          lastEvaluatedIso: new Date().toISOString(),
          violationCount: normalizedViolations.length,
        },
        topViolations: normalizedViolations.slice(0, 8),
      };
      const summaryRef = doc(db, COLLECTIONS.complianceViolations, report.employeeId);
      const violationsRef = doc(db, COLLECTIONS.complianceViolations, report.employeeId, 'violations', 'list');

      return Promise.allSettled([
        setDoc(summaryRef, summaryObject, { merge: true }),
        setDoc(violationsRef, { list: normalizedViolations, updatedAt: serverTimestamp(), updatedAtIso: new Date().toISOString() }),
      ]).then((results) => {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const target = index === 0 ? 'summary' : 'violations';
            console.error('[ComplianceEngine] Firestore write failed.', {
              employeeId: report.employeeId,
              target,
              error: result.reason,
            });
          }
        });
      });
    });

    await Promise.all(saveTasks);

    window.dispatchEvent(
      new CustomEvent('complianceScanCompleted', {
        detail: { reason, generatedAt: engineResult.generatedAt },
      })
    );

    console.info('[ComplianceEngine] Scan completed.', {
      reason,
      generatedAt: engineResult.generatedAt,
      employeesEvaluated: engineResult.results.length,
    });

    return engineResult;
  } catch (error) {
    console.error('[ComplianceEngine] Failed to run compliance scan:', error);
    return null;
  } finally {
    scanInProgress = false;
    if (pendingReason) {
      const nextReason = pendingReason;
      pendingReason = null;
      scheduleComplianceRun(nextReason);
    }
  }
};

const attachRealtimeListeners = () => {
  if (!ensureFirebaseReady()) return;

  const { collection, onSnapshot } = window.firestoreFunctions;
  const db = window.firebaseDb;

  subscriptions.forEach((unsubscribe) => unsubscribe());
  subscriptions = [];

  subscriptions.push(
    onSnapshot(collection(db, COLLECTIONS.employees), (snapshot) => {
      engineState.employees = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        employeeId: docSnap.id,
        ...docSnap.data(),
      }));
      scheduleComplianceRun('employees');
    })
  );

  subscriptions.push(
    onSnapshot(collection(db, COLLECTIONS.attendance), (snapshot) => {
      engineState.attendanceRecords = parseAttendanceSnapshot(snapshot);
      scheduleComplianceRun('attendance');
    })
  );

  subscriptions.push(
    onSnapshot(collection(db, COLLECTIONS.payroll), (snapshot) => {
      engineState.payrollRuns = parsePayrollSnapshot(snapshot);
      scheduleComplianceRun('payroll');
    })
  );

  subscriptions.push(
    onSnapshot(collection(db, COLLECTIONS.stateRules), (snapshot) => {
      engineState.stateRules = parseStateRulesSnapshot(snapshot);
      scheduleComplianceRun('stateRules');
    })
  );

  const payrollCompletionHandler = () => {
    scheduleComplianceRun('payrollCompletedEvent');
  };
  window.addEventListener('payrollRunCompleted', payrollCompletionHandler);
  subscriptions.push(() => window.removeEventListener('payrollRunCompleted', payrollCompletionHandler));
};

const evaluateTestExpectation = (resultByEmployeeId, expectation = {}) => {
  const employeeResult = resultByEmployeeId.get(expectation.employeeId);
  if (!employeeResult) {
    return {
      employeeId: expectation.employeeId,
      status: 'missing_employee',
      message: 'Employee result missing from compliance output.',
    };
  }

  const actualTypes = new Set((employeeResult.violations || []).map((violation) => violation.type));
  const expectedTypes = new Set(expectation.expectedViolationTypes || []);

  const missingViolations = [...expectedTypes].filter((type) => !actualTypes.has(type));
  const unexpectedViolations = [...actualTypes].filter((type) => !expectedTypes.has(type));
  const passed = missingViolations.length === 0 && unexpectedViolations.length === 0;

  return {
    employeeId: expectation.employeeId,
    passed,
    missingViolations,
    unexpectedViolations,
    expectedTypes: [...expectedTypes],
    actualTypes: [...actualTypes],
  };
};

const runComplianceScanTest = async ({
  payrollRunId,
  expectedByEmployee = [],
  reason = 'testHarness',
} = {}) => {
  const result = await runComplianceScan(reason);
  if (!result) {
    return {
      passed: false,
      payrollRunId,
      reason,
      message: 'Compliance scan failed to execute.',
      mismatches: expectedByEmployee,
    };
  }

  const resultByEmployeeId = new Map(result.results.map((item) => [item.employeeId, item]));
  const evaluations = expectedByEmployee.map((expectation) =>
    evaluateTestExpectation(resultByEmployeeId, expectation)
  );
  const mismatches = evaluations.filter((evaluation) => !evaluation.passed);

  const summary = {
    passed: mismatches.length === 0,
    payrollRunId,
    reason,
    generatedAt: result.generatedAt,
    checks: evaluations.length,
    mismatches,
  };
  if (!summary.passed) {
    console.warn('[ComplianceEngine][Test] Mismatches detected.', summary);
  } else {
    console.info('[ComplianceEngine][Test] All compliance expectations passed.', summary);
  }
  return summary;
};

const initComplianceEngine = () => {
  if (!ensureFirebaseReady()) {
    window.setTimeout(initComplianceEngine, 1000);
    return;
  }
  attachRealtimeListeners();
};

window.runComplianceScan = runComplianceScan;
window.runComplianceScanTest = runComplianceScanTest;
window.addEventListener('DOMContentLoaded', () => {
  initComplianceEngine();
});
