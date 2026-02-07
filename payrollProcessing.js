import { savePayrollRun } from './payrollService.js';

export const buildPayrollRunPayload = ({
  month,
  year,
  payrollData,
  status = 'Completed',
}) => {
  const normalizedPayroll = payrollData.map((record) => {
    const reimbursementTotal = Number(record.reimbursementTotal) || 0;
    if (record.reimbursementApplied) {
      return record;
    }
    return {
      ...record,
      reimbursementTotal,
      netSalary: (Number(record.netSalary) || 0) + reimbursementTotal,
      reimbursementApplied: reimbursementTotal > 0,
    };
  });

  const employeeCount = normalizedPayroll.length;
  const totalPayout = normalizedPayroll.reduce(
    (sum, record) => sum + (Number(record.netSalary) || 0),
    0
  );

  return {
    month,
    year,
    status,
    totalPayout,
    employeeCount,
    payrollData: normalizedPayroll,
  };
};

export const savePayroll = async ({ month, year, payrollData }) => {
  const payload = buildPayrollRunPayload({ month, year, payrollData });
  return savePayrollRun(payload);
};
