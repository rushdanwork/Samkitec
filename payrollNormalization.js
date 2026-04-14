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
  const basic = toNumber(record.basic ?? record.basicSalary ?? 0);
  const hra = toNumber(record.hra ?? 0);
  const allowances = toNumber(record.allowances ?? 0);
  const gross = toNumber(record.gross ?? record.earnings ?? basic + hra + allowances);
  const pf = toNumber(record.pf ?? record.pfDeduction ?? 0);
  const esi = toNumber(record.esi ?? record.esiDeduction ?? 0);
  const net = toNumber(record.net ?? gross - pf - esi);
  return {
    employeeId: String(record.employeeId || record.empId || record.id || '').trim(),
    month: toMonthKey(record.month || record.period || ''),
    basic,
    hra,
    allowances,
    gross,
    pf,
    esi,
    net,
    createdAt: record.createdAt || record.generatedAt || null,
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
