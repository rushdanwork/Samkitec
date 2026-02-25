import { savePayrollRun } from './payrollService.js';

export const buildPayrollRunPayload = ({
  month,
  year,
  payrollData,
  status = 'Completed',
}) => {
  const employeeCount = payrollData.length;
  const totalPayout = payrollData.reduce(
    (sum, record) => sum + (Number(record.netSalary) || 0),
    0
  );

  return {
    month,
    year,
    status,
    totalPayout,
    employeeCount,
    payrollData,
  };
};

export const savePayroll = async ({ month, year, payrollData }) => {
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || '').trim())
    ? String(month).trim()
    : `${year}-${String(month).padStart(2, '0')}`;

  await Promise.all(
    (payrollData || []).map((record) =>
      savePayrollRun({
        employeeId: record.employeeId,
        month: monthKey,
        basic: record.basic ?? record.basicSalary,
        hra: record.hra,
        allowances: record.allowances,
        pf: record.pf ?? record.pfDeduction,
        esi: record.esi ?? record.esiDeduction,
        deductions: record.deductions,
        gross: record.gross ?? record.earnings,
        net: record.net ?? record.netSalary ?? record.netPay,
      })
    )
  );

  const payload = buildPayrollRunPayload({ month, year, payrollData });
  const payrollRunId = monthKey;
  const runId = `run_${Date.now()}`;

  if (typeof window !== 'undefined') {
    const allEmployeePayrollResults = payload.payrollData;
    let runs = JSON.parse(localStorage.getItem('payrollRuns')) || [];
    runs.push({
      runId,
      timestamp: Date.now(),
      payrollData: allEmployeePayrollResults,
      payrollRunId,
    });
    localStorage.setItem('payrollRuns', JSON.stringify(runs));

    window.__latestRunId = runId;
    document.dispatchEvent(
      new CustomEvent('payrollRunCompleted', {
        detail: {
          runId,
          payrollRunId,
          month,
          year,
          employeeCount: payload.employeeCount,
          totalPayout: payload.totalPayout,
        },
      })
    );

    if (typeof window.runComplianceScan === 'function') {
      window.runComplianceScan(runId);
    }
  }

  return payrollRunId;
};
