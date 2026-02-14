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
  const payload = buildPayrollRunPayload({ month, year, payrollData });
  const payrollRunId = await savePayrollRun(payload);
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
