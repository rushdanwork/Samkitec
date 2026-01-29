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
  const runId = await savePayrollRun(payload);
  return runId;
};
