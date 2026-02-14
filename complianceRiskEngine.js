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
};

const scanState = {
  inProgress: false,
  pendingRunId: null,
};

const ensureFirebaseReady = () => Boolean(window.firebaseDb && window.firestoreFunctions);
const toLowerSeverity = (value = 'Low') => String(value).trim().toLowerCase();

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

const resolveRunId = async (db, runIdMaybe) => {
  const { collection, doc, getDoc, getDocs, orderBy, query, limit } = window.firestoreFunctions;
  if (runIdMaybe && !['manual', 'auto', 'payrollCompletedEvent'].includes(runIdMaybe)) {
    const runSnap = await getDoc(doc(db, COLLECTIONS.payroll, runIdMaybe));
    if (runSnap.exists()) return runIdMaybe;
  }

  const latestRunSnapshot = await getDocs(
    query(collection(db, COLLECTIONS.payroll), orderBy('generatedAt', 'desc'), limit(1))
  );
  const latest = latestRunSnapshot.docs[0];
  return latest?.id || null;
};

const runComplianceScan = async (runIdMaybe = 'manual') => {
  if (!ensureFirebaseReady()) return null;
  if (scanState.inProgress) {
    scanState.pendingRunId = runIdMaybe;
    return null;
  }

  const db = window.firebaseDb;
  const { doc, getDoc, setDoc, serverTimestamp } = window.firestoreFunctions;

  scanState.inProgress = true;

  try {
    const runId = await resolveRunId(db, runIdMaybe);
    if (!runId) {
      console.warn('[ComplianceEngine] No payroll run available to scan.');
      return null;
    }

    console.info('[ComplianceEngine] Scan started.', { runId });

    const [runSnap, employees, attendanceRecords, payrollRuns, stateRules] = await Promise.all([
      getDoc(doc(db, COLLECTIONS.payroll, runId)),
      fetchCollectionAsArray(db, COLLECTIONS.employees),
      fetchAttendanceAsObject(db),
      fetchCollectionAsArray(db, COLLECTIONS.payroll),
      fetchStateRulesAsObject(db),
    ]);

    if (!runSnap.exists()) {
      console.warn('[ComplianceEngine] Payroll run not found.', { runId });
      return null;
    }

    const normalizedData = normalizeInputData(employees, attendanceRecords, payrollRuns, stateRules);

    const results = normalizedData.employees
      .map((employee) => {
        if (!employee.employeeId) return null;
        const payrollHistory = normalizedData.payrollByEmployee.get(employee.employeeId) || [];
        const payrollRecord = payrollHistory[payrollHistory.length - 1] || {};
        const attendanceSummary = normalizedData.attendanceByEmployee.get(employee.employeeId) || {};

        const { allViolations, rules } = buildEmployeeRuleResults({
          employee,
          payrollRecord,
          payrollHistory,
          attendanceSummary,
          stateRules: normalizedData.stateRules,
        });

        const riskScore = calculateRiskScore(allViolations);
        const severity = toLowerSeverity(getRiskLevel(riskScore));
        const summary = {
          riskScore,
          severity,
          violationCount: allViolations.length,
          timestamp: new Date().toISOString(),
          employeeId: employee.employeeId,
          employeeName: employee.name ?? employee.employeeName ?? 'Unknown',
        };

        return {
          employeeId: employee.employeeId,
          summary,
          rules,
          allViolations,
        };
      })
      .filter(Boolean);

    const writeTasks = results.map(async (result) => {
      console.info('[ComplianceEngine] Per-employee rule results.', {
        runId,
        employeeId: result.employeeId,
        summary: result.summary,
        rules: result.rules,
      });

      await writeEmployeeComplianceResult({
        db,
        runId,
        employeeId: result.employeeId,
        summary: result.summary,
        rules: result.rules,
      });

      await writeLegacySummary({
        db,
        employeeId: result.employeeId,
        summary: result.summary,
        allViolations: result.allViolations,
      });
    });

    await Promise.all(writeTasks);

    await setDoc(
      doc(db, COLLECTIONS.complianceResults, runId, '_meta', 'scanInfo'),
      {
        runId,
        employeeIds: results.map((item) => item.employeeId),
        completedAt: new Date().toISOString(),
        completedAtTs: serverTimestamp(),
      },
      { merge: true }
    );

    window.dispatchEvent(
      new CustomEvent('complianceScanCompleted', {
        detail: { runId, employeesEvaluated: results.length },
      })
    );

    console.info('[ComplianceEngine] Scan completed.', { runId, employeesEvaluated: results.length });

    return {
      runId,
      generatedAt: new Date().toISOString(),
      results,
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


const runComplianceScanTest = async ({ runId, expectedByEmployee = [] } = {}) => {
  const result = await runComplianceScan(runId || 'manual');
  if (!result) {
    return { passed: false, runId: runId || null, mismatches: expectedByEmployee, message: 'Scan failed.' };
  }

  const byEmployee = new Map(result.results.map((item) => [item.employeeId, item]));
  const mismatches = [];

  expectedByEmployee.forEach((expectation) => {
    const current = byEmployee.get(expectation.employeeId);
    if (!current) {
      mismatches.push({ employeeId: expectation.employeeId, reason: 'missing_employee' });
      return;
    }
    if (Number.isFinite(expectation.maxRiskScore) && current.summary.riskScore > expectation.maxRiskScore) {
      mismatches.push({
        employeeId: expectation.employeeId,
        reason: 'risk_score_exceeded',
        expected: expectation.maxRiskScore,
        actual: current.summary.riskScore,
      });
    }
  });

  return {
    passed: mismatches.length === 0,
    runId: result.runId,
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
