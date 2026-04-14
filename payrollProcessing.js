import { finalizePayrollRun } from './payrollService.js';
import { normalizePayrollRecord } from './payrollNormalization.js';

export const buildPayrollRunPayload = ({
  month,
  year,
  payrollData,
  status = 'Completed',
}) => {
  const normalizedPayrollData = (payrollData || []).map((record) => normalizePayrollRecord(record));
  const employeeCount = normalizedPayrollData.length;
  const totalPayout = normalizedPayrollData.reduce((sum, record) => sum + (Number(record.net) || 0), 0);

  return {
    month,
    year,
    status,
    totalPayout,
    employeeCount,
    payrollData: normalizedPayrollData,
    type: 'run',
  };
};

export const savePayroll = async ({ month, year, payrollData }) => {
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || '').trim())
    ? String(month).trim()
    : `${year}-${String(month).padStart(2, '0')}`;
  const result = await finalizePayrollRun({ month: monthKey });
  const payload = buildPayrollRunPayload({
    month: result?.run?.month || month,
    year: result?.run?.year || year,
    payrollData: result?.records || payrollData || [],
  });
  const payrollRunId = result?.runId || result?.run?.id || monthKey;
  const runId = `run_${Date.now()}`;

  if (typeof window !== 'undefined') {
    const allEmployeePayrollResults = payload.payrollData || [];
    let runs = JSON.parse(localStorage.getItem('payrollRuns')) || [];
    runs.push({
      runId,
      timestamp: Date.now(),
      payrollData: allEmployeePayrollResults,
      payrollRunId,
      month: payload.month,
      year: payload.year,
      type: 'run',
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
