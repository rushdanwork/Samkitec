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

const notifyHrIfCritical = async ({ risks }) => {
  const critical = risks.filter((risk) => risk.severity === "critical" || risk.severity === "high");
  if (critical.length === 0) return;

  await db.collection("notifications").add({
    type: "COMPLIANCE_ALERT",
    message: `Critical compliance risks detected (${critical.length}).` ,
    riskLevel: "high",
    timestamp: new Date(),
  });
};

export const runComplianceDeepScan = onCall(async (request) => {
  const payrollSnapshot = await db.collection("payrollRecords").get();
  const employeesSnapshot = await db.collection("employees").get();

  const payroll = payrollSnapshot.docs.map((doc) => ({ employeeId: doc.id, ...doc.data() }));
  const employees = employeesSnapshot.docs.map((doc) => ({ employeeId: doc.id, ...doc.data() }));

  const report = buildComplianceReport({ payroll, employees });
  const month = toMonthKey();

  await db.collection("complianceScans").doc(month).set({
    score: report.score,
    scannedAt: new Date(),
    risks: report.risks,
  });

  await notifyHrIfCritical(report);

  return report;
});

export const scheduledComplianceDeepScan = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "Asia/Kolkata",
  },
  async () => {
    const payrollSnapshot = await db.collection("payrollRecords").get();
    const employeesSnapshot = await db.collection("employees").get();

    const payroll = payrollSnapshot.docs.map((doc) => ({ employeeId: doc.id, ...doc.data() }));
    const employees = employeesSnapshot.docs.map((doc) => ({ employeeId: doc.id, ...doc.data() }));

    const report = buildComplianceReport({ payroll, employees });
    const month = toMonthKey();

    await db.collection("complianceScans").doc(month).set({
      score: report.score,
      scannedAt: new Date(),
      risks: report.risks,
    });

    await notifyHrIfCritical(report);
  }
);
