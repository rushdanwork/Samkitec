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

  if (typeof window !== 'undefined') {
    window.__latestRunId = payrollRunId;
    window.dispatchEvent(
      new CustomEvent('payrollRunCompleted', {
        detail: {
          runId: payrollRunId,
          payrollRunId,
          month,
          year,
          employeeCount: payload.employeeCount,
          totalPayout: payload.totalPayout,
        },
      })
    );

    if (typeof window.runComplianceScan === 'function') {
      window.runComplianceScan(payrollRunId).catch((error) => {
        console.error('[Payroll] Compliance scan trigger failed after payroll completion.', error);
      });
    }
  }

  return payrollRunId;
};
