(function(window) {
    const DEFAULT_OVERTIME_LIMIT = 2;
    const ILLEGAL_ID_CHARS = /[\/\\\?#%\.\[\]]/g;

    function sanitize(id) {
        if (typeof window.sanitizeId === 'function') {
            return window.sanitizeId(id);
        }
        return String(id ?? '').trim().replace(ILLEGAL_ID_CHARS, '-');
    }

    function parseDateFromRecord(record) {
        if (!record) return null;
        const dateCandidate = record.paymentDate || record.createdAt;
        const parsed = dateCandidate ? new Date(dateCandidate) : null;
        return parsed && !isNaN(parsed) ? parsed : null;
    }

    function comparePayrollRecords(a, b) {
        const dateA = parseDateFromRecord(a);
        const dateB = parseDateFromRecord(b);
        if (dateA && dateB) return dateA - dateB;
        return 0;
    }

    function getMonthKey(date) {
        return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : null;
    }

    function detectPayrollAnomalies({
        employees = [],
        attendanceRecords = {},
        payrollRecords = [],
        overtimeLimitHours = DEFAULT_OVERTIME_LIMIT,
        firebaseAvailable = false
    } = {}) {
        const anomalies = [];
        const employeeMap = new Map();

        employees.forEach(emp => {
            const safeId = sanitize(emp.id);
            employeeMap.set(safeId, emp);
            if (!emp.id || ILLEGAL_ID_CHARS.test(emp.id)) {
                anomalies.push({
                    type: 'Data Error',
                    employeeId: emp.id || safeId,
                    employeeName: emp.name || 'Unknown Employee',
                    date: '',
                    description: 'Invalid or missing employee ID detected. Please review the employee record.'
                });
            }
        });

        Object.entries(attendanceRecords || {}).forEach(([date, records]) => {
            if (!records || typeof records !== 'object') {
                anomalies.push({
                    type: 'Data Error',
                    employeeId: '',
                    employeeName: '',
                    date,
                    description: 'Attendance entry is malformed or missing expected fields.'
                });
                return;
            }

            const normalized = {};
            Object.entries(records).forEach(([rawId, record]) => {
                const safeId = sanitize(rawId);
                normalized[safeId] = normalized[safeId] || [];
                normalized[safeId].push(record);

                if (record?.firestoreMissing) {
                    anomalies.push({
                        type: 'Data Error',
                        employeeId: rawId,
                        employeeName: employeeMap.get(safeId)?.name || 'Unknown Employee',
                        date,
                        description: 'Attendance document is missing from Firestore and could not be synchronized.'
                    });
                }

                if (!record || record.status === undefined) {
                    anomalies.push({
                        type: 'Data Error',
                        employeeId: rawId,
                        employeeName: employeeMap.get(safeId)?.name || 'Unknown Employee',
                        date,
                        description: 'Attendance record has undefined fields. Please re-save the entry.'
                    });
                }

                if (['present', 'late', 'halfday'].includes(record?.status) && (!record.time || !record.time.trim())) {
                    anomalies.push({
                        type: 'Mismatch',
                        employeeId: rawId,
                        employeeName: employeeMap.get(safeId)?.name || 'Unknown Employee',
                        date,
                        description: 'Employee marked present without punch-in/out time.'
                    });
                }

                if (record?.overtimeHours && record.overtimeHours > overtimeLimitHours) {
                    anomalies.push({
                        type: 'Mismatch',
                        employeeId: rawId,
                        employeeName: employeeMap.get(safeId)?.name || 'Unknown Employee',
                        date,
                        description: `Recorded overtime of ${record.overtimeHours}h exceeds the ${overtimeLimitHours}h daily limit.`
                    });
                }
            });

            Object.entries(normalized).forEach(([safeId, items]) => {
                if (items.length > 1) {
                    anomalies.push({
                        type: 'Missing Attendance',
                        employeeId: safeId,
                        employeeName: employeeMap.get(safeId)?.name || 'Unknown Employee',
                        date,
                        description: 'Duplicate attendance entries detected for the same day.'
                    });
                }
            });

            employeeMap.forEach((emp, safeId) => {
                const hasRecord = Boolean(records[safeId] || records[emp.id]);
                if (!hasRecord) {
                    anomalies.push({
                        type: 'Missing Attendance',
                        employeeId: emp.id,
                        employeeName: emp.name,
                        date,
                        description: 'Attendance not recorded for this employee on the specified date.'
                    });
                }
            });
        });

        const attendanceIds = new Set();
        Object.values(attendanceRecords || {}).forEach(records => {
            if (!records) return;
            Object.keys(records).forEach(id => attendanceIds.add(sanitize(id)));
        });

        payrollRecords.forEach(record => {
            const safeId = sanitize(record.employeeId);
            if (record.netSalary < 0) {
                anomalies.push({
                    type: 'Salary Error',
                    employeeId: record.employeeId,
                    employeeName: record.employeeName,
                    date: record.paymentDate || '',
                    description: 'Net salary is negative. Please review earning and deduction inputs.'
                });
            }

            const totalEarnings = (record.basicSalary || 0) + (record.allowances || 0);
            if (record.deductions > totalEarnings) {
                anomalies.push({
                    type: 'Salary Error',
                    employeeId: record.employeeId,
                    employeeName: record.employeeName,
                    date: record.paymentDate || '',
                    description: 'Deductions exceed total earnings for the period.'
                });
            }

            if (!attendanceIds.has(safeId)) {
                anomalies.push({
                    type: 'Missing Attendance',
                    employeeId: record.employeeId,
                    employeeName: record.employeeName,
                    date: record.paymentDate || '',
                    description: 'Employee processed in payroll but has zero attendance records.'
                });
            }

            if (firebaseAvailable && record?.firestoreMissing) {
                anomalies.push({
                    type: 'Data Error',
                    employeeId: record.employeeId,
                    employeeName: record.employeeName,
                    date: record.paymentDate || '',
                    description: 'Payroll record is missing from Firestore; please retry syncing this entry.'
                });
            }
        });

        const payrollByEmployee = payrollRecords.reduce((acc, record) => {
            const safeId = sanitize(record.employeeId);
            acc[safeId] = acc[safeId] || [];
            acc[safeId].push(record);
            return acc;
        }, {});

        Object.entries(payrollByEmployee).forEach(([safeId, records]) => {
            const sorted = records.slice().sort(comparePayrollRecords);
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];
                const previousNet = prev?.netSalary || 0;
                if (!previousNet) continue;
                const delta = (curr.netSalary - previousNet) / previousNet;
                if (Math.abs(delta) > 0.25) {
                    anomalies.push({
                        type: 'Salary Error',
                        employeeId: curr.employeeId,
                        employeeName: curr.employeeName,
                        date: curr.paymentDate || curr.period || '',
                        description: `Net salary changed by ${(delta * 100).toFixed(1)}% compared to the previous month.`
                    });
                }
            }
        });

        payrollRecords.forEach(record => {
            const recordDate = parseDateFromRecord(record);
            const monthKey = getMonthKey(recordDate);
            if (!monthKey) return;
            const leaveDays = Object.entries(attendanceRecords || {}).filter(([date]) => date.startsWith(monthKey)).reduce((total, [, dayRecords]) => {
                const dayRecord = dayRecords?.[record.employeeId] || dayRecords?.[sanitize(record.employeeId)];
                return total + (dayRecord?.status === 'leave' ? 1 : 0);
            }, 0);

            if (leaveDays > 0 && (!record.deductions || record.deductions <= 0)) {
                anomalies.push({
                    type: 'Mismatch',
                    employeeId: record.employeeId,
                    employeeName: record.employeeName,
                    date: record.paymentDate || monthKey,
                    description: `Leave recorded (${leaveDays} day${leaveDays > 1 ? 's' : ''}) but payroll deductions were not applied.`
                });
            }
        });

        return anomalies;
    }

    window.detectPayrollAnomalies = detectPayrollAnomalies;
})(window);
