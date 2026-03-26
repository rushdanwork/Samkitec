const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toMonthKey = (value) => {
  const monthValue = String(value || '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue)) return monthValue;
  return monthValue;
};

export function normalizePayrollRecord(record = {}) {
  return {
    employeeId: String(record.employeeId || record.empId || record.id || '').trim(),
    month: toMonthKey(record.month || record.period || ''),
    gross: toNumber(record.gross ?? record.earnings ?? record.totalEarnings ?? 0),
    net: toNumber(record.net ?? record.netSalary ?? record.netPay ?? 0),
    deductions: toNumber(record.deductions ?? 0),
    pf: toNumber(record.pf ?? record.pfDeduction ?? record.deductionsPF ?? 0),
    esi: toNumber(record.esi ?? record.esiDeduction ?? record.deductionsESI ?? 0),
    workingDays: toNumber(record.workingDays ?? 0),
    presentDays: toNumber(record.presentDays ?? record.paidDays ?? 0),
    generatedAt: record.generatedAt || record.createdAt || null,
    type: 'summary',
  };
}

export function normalizePayrollRunSnapshot(run = {}) {
  const payrollData = Array.isArray(run.payrollData)
    ? run.payrollData.map((item) => normalizePayrollRecord(item))
    : [];

  return {
    month: String(run.month || '').trim(),
    year: String(run.year || '').trim(),
    status: String(run.status || 'Completed').trim(),
    employeeCount: toNumber(run.employeeCount ?? payrollData.length),
    totalPayout: toNumber(
      run.totalPayout ?? payrollData.reduce((sum, item) => sum + toNumber(item.net), 0)
    ),
    payrollData,
    generatedAt: run.generatedAt || null,
    type: 'run',
  };
}
