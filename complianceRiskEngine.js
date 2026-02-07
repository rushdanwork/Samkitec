import runComplianceEngine from './backend/complianceEngine.js';

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
    const engineResult = runComplianceEngine(
      engineState.employees,
      engineState.attendanceRecords,
      engineState.payrollRuns,
      engineState.stateRules
    );

    const saveTasks = engineResult.results.map((report) => {
      const summaryObject = {
        summary: {
          employeeId: report.employeeId,
          employeeName: report.employeeName,
          riskScore: report.riskScore,
          riskLevel: report.riskLevel,
          lastEvaluated: serverTimestamp(),
        },
      };
      const summaryRef = doc(db, COLLECTIONS.complianceViolations, report.employeeId);
      const violationsRef = doc(db, COLLECTIONS.complianceViolations, report.employeeId, 'violations', 'list');
      let violationsArray = [];

      try {
        const sourceViolations = Array.isArray(report.violations) ? report.violations : [];
        violationsArray = sourceViolations.map(({ type, severity, message, recommendedFix }) => ({
          type,
          severity,
          message,
          recommendedFix,
        }));
      } catch (error) {
        console.warn('[ComplianceEngine] Failed to normalize violations array:', error);
        violationsArray = [];
      }

      return Promise.all([
        setDoc(summaryRef, summaryObject, { merge: true }),
        setDoc(violationsRef, { list: violationsArray }),
      ]);
    });

    await Promise.all(saveTasks);

    window.dispatchEvent(
      new CustomEvent('complianceScanCompleted', {
        detail: { reason, generatedAt: engineResult.generatedAt },
      })
    );

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
};

const initComplianceEngine = () => {
  if (!ensureFirebaseReady()) {
    window.setTimeout(initComplianceEngine, 1000);
    return;
  }
  attachRealtimeListeners();
};

window.runComplianceScan = runComplianceScan;
window.addEventListener('DOMContentLoaded', () => {
  initComplianceEngine();
});
