import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

const SEVERITY_SCORE = {
  critical: 30,
  high: 20,
  medium: 12,
  low: 6,
};

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const toMonthKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const buildRisk = ({ category, ruleId, severity, message, employeeId, meta = {} }) => ({
  category,
  ruleId,
  severity,
  score: SEVERITY_SCORE[severity] ?? 0,
  message,
  employeeId,
  meta,
  createdAt: new Date(),
});

const tdsEngine = ({ payroll, declarations, regimeSelections }) => {
  const risks = [];
  payroll.forEach((record) => {
    const annualIncome = toNumber(record.gross) * 12;
    const tdsDeducted = toNumber(record.tds);
    const regime = regimeSelections?.[record.employeeId] || "old";

    if (annualIncome > 1000000 && tdsDeducted === 0) {
      risks.push(
        buildRisk({
          category: "TDS",
          ruleId: "TDS-R1",
          severity: "critical",
          message: "High annual income with zero TDS deduction.",
          employeeId: record.employeeId,
          meta: { annualIncome, regime },
        })
      );
    }

    if (declarations?.[record.employeeId] && declarations[record.employeeId].regime !== regime) {
      risks.push(
        buildRisk({
          category: "TDS",
          ruleId: "TDS-R2",
          severity: "high",
          message: "Regime mismatch between employee declaration and payroll settings.",
          employeeId: record.employeeId,
        })
      );
    }
  });

  return risks;
};

const pfEngine = ({ payroll, employees }) => {
  const risks = [];
  payroll.forEach((record) => {
    const employee = employees.find((emp) => emp.employeeId === record.employeeId);
    const basic = toNumber(record.basic || employee?.basicSalary);
    const pfDeduction = toNumber(record.pf);

    if (basic <= 15000 && pfDeduction === 0) {
      risks.push(
        buildRisk({
          category: "PF",
          ruleId: "PF-R1",
          severity: "critical",
          message: "PF-eligible employee missing PF deduction.",
          employeeId: record.employeeId,
          meta: { basic },
        })
      );
    }

    if (basic > 15000 && pfDeduction > 0 && !employee?.voluntaryPf) {
      risks.push(
        buildRisk({
          category: "PF",
          ruleId: "PF-R2",
          severity: "medium",
          message: "PF deduction above wage cap without voluntary flag.",
          employeeId: record.employeeId,
        })
      );
    }

    if (!employee?.pfNumber) {
      risks.push(
        buildRisk({
          category: "PF",
          ruleId: "PF-R3",
          severity: "high",
          message: "Missing PF number for PF-eligible employee.",
          employeeId: record.employeeId,
        })
      );
    }
  });

  return risks;
};

const esiEngine = ({ payroll, employees }) => {
  const risks = [];
  payroll.forEach((record) => {
    const employee = employees.find((emp) => emp.employeeId === record.employeeId);
    const gross = toNumber(record.gross);
    const esiDeduction = toNumber(record.esi);

    if (gross <= 21000 && esiDeduction === 0) {
      risks.push(
        buildRisk({
          category: "ESI",
          ruleId: "ESI-R1",
          severity: "critical",
          message: "ESI threshold met but deduction missing.",
          employeeId: record.employeeId,
          meta: { gross },
        })
      );
    }

    if (gross > 21000 && esiDeduction > 0 && employee?.esiExitMonth !== toMonthKey()) {
      risks.push(
        buildRisk({
          category: "ESI",
          ruleId: "ESI-R2",
          severity: "medium",
          message: "Employee crossed threshold but ESI exit not recorded.",
          employeeId: record.employeeId,
        })
      );
    }
  });

  return risks;
};

const ptEngine = ({ payroll, stateSlabs }) => {
  const risks = [];
  payroll.forEach((record) => {
    const slab = stateSlabs?.[record.state] || [];
    const gross = toNumber(record.gross);
    const ptDeduction = toNumber(record.pt);
    const expected = slab.find((item) => gross >= item.min && gross <= item.max);

    if (expected && ptDeduction !== expected.amount) {
      risks.push(
        buildRisk({
          category: "PT",
          ruleId: "PT-R1",
          severity: "high",
          message: "Professional tax mismatch with state slab.",
          employeeId: record.employeeId,
          meta: { expected: expected.amount, actual: ptDeduction, state: record.state },
        })
      );
    }
  });

  return risks;
};

const calculateComplianceScore = (risks = []) => {
  const scorePenalty = risks.reduce((sum, risk) => sum + (risk.score || 0), 0);
  return Math.max(0, 100 - Math.min(scorePenalty, 100));
};

const toPayrollMonth = (value) => {
  const raw = String(value || "").trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return toMonthKey();
};

const round2 = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const buildComplianceReport = ({ payroll, employees, declarations, regimeSelections, stateSlabs }) => {
  const risks = [
    ...tdsEngine({ payroll, declarations, regimeSelections }),
    ...pfEngine({ payroll, employees }),
    ...esiEngine({ payroll, employees }),
    ...ptEngine({ payroll, stateSlabs }),
  ];

  return {
    score: calculateComplianceScore(risks),
    risks,
  };
};

const notifyHrIfCritical = async ({ risks, userId }) => {
  const critical = risks.filter((risk) => risk.severity === "critical" || risk.severity === "high");
  if (critical.length === 0 || !userId) return;

  await db.collection("users").doc(userId).collection("notifications").add({
    type: "COMPLIANCE_ALERT",
    message: `Critical compliance risks detected (${critical.length}).` ,
    riskLevel: "high",
    timestamp: new Date(),
  });
};

export const runComplianceDeepScan = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new Error("unauthenticated");
  }
  const payrollSnapshot = await db.collection("users").doc(userId).collection("payrollRecords").get();
  const employeesSnapshot = await db.collection("users").doc(userId).collection("employees").get();

  const payroll = payrollSnapshot.docs.flatMap((doc) => {
    const data = doc.data();
    const payrollData = Array.isArray(data.payrollData) ? data.payrollData : [];
    return payrollData.map((record) => ({ ...record, payrollRunId: doc.id }));
  });
  const employees = employeesSnapshot.docs.map((doc) => ({ employeeId: doc.id, ...doc.data() }));

  const report = buildComplianceReport({ payroll, employees });
  const month = toMonthKey();

  await db.collection("users").doc(userId).collection("complianceScans").doc(month).set({
    score: report.score,
    scannedAt: new Date(),
    risks: report.risks,
  });

  await notifyHrIfCritical({ ...report, userId });

  return report;
});

export const finalizePayroll = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new Error("unauthenticated");
  }

  const month = toPayrollMonth(request.data?.month);
  const year = month.slice(0, 4);
  const monthNum = month.slice(5, 7);
  const employeesRef = db.collection("users").doc(userId).collection("employees");
  const payrollRecordsRef = db.collection("users").doc(userId).collection("payrollRecords");
  const payrollRunsRef = db.collection("users").doc(userId).collection("payrollRuns");
  const employeesSnap = await employeesRef.get();

  const batch = db.batch();
  const records = [];

  employeesSnap.forEach((employeeDoc) => {
    const employee = employeeDoc.data() || {};
    const employeeId = employeeDoc.id;
    const basic = round2(employee.basic ?? employee.basicSalary ?? 0);
    const hra = round2(employee.hra ?? basic * 0.4);
    const allowances = round2(employee.allowances ?? 0);
    const gross = round2(basic + hra + allowances);
    const pf = round2(employee.pfEligible === false ? 0 : basic * 0.12);
    const esi = round2(employee.esiEligible === false ? 0 : gross * 0.0075);
    const net = round2(gross - pf - esi);

    const record = {
      employeeId,
      month,
      basic,
      hra,
      allowances,
      gross,
      pf,
      esi,
      net,
      createdAt: new Date(),
    };
    records.push(record);
    batch.set(payrollRecordsRef.doc(`${employeeId}_${month}`), record, { merge: true });
  });

  const runId = `${month}_${Date.now()}`;
  const runPayload = {
    id: runId,
    month,
    year,
    monthNum,
    generatedAt: new Date(),
    status: "Completed",
    employeeCount: records.length,
    totalPayout: round2(records.reduce((sum, item) => sum + toNumber(item.net), 0)),
  };
  batch.set(payrollRunsRef.doc(runId), runPayload, { merge: false });
  await batch.commit();

  return { runId, run: runPayload, records };
});

export const scheduledComplianceDeepScan = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "Asia/Kolkata",
  },
  async () => {
    const usersSnapshot = await db.collection("users").get();

    await Promise.all(usersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id;
      const payrollSnapshot = await db.collection("users").doc(userId).collection("payrollRecords").get();
      const employeesSnapshot = await db.collection("users").doc(userId).collection("employees").get();

      const payroll = payrollSnapshot.docs.flatMap((doc) => {
        const data = doc.data();
        const payrollData = Array.isArray(data.payrollData) ? data.payrollData : [];
        return payrollData.map((record) => ({ ...record, payrollRunId: doc.id }));
      });
      const employees = employeesSnapshot.docs.map((doc) => ({ employeeId: doc.id, ...doc.data() }));

      const report = buildComplianceReport({ payroll, employees });
      const month = toMonthKey();

      await db.collection("users").doc(userId).collection("complianceScans").doc(month).set({
        score: report.score,
        scannedAt: new Date(),
        risks: report.risks,
      });

      await notifyHrIfCritical({ ...report, userId });
    }));
  }
);
