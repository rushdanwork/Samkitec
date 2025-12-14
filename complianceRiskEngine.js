(function(window) {
    // complianceRiskEngine.js v1.0 - orchestrates PF/ESI/TDS compliance scoring in the browser
    const DEFAULT_MONTH = () => new Date().toISOString().slice(0, 7);
    const MAX_CATEGORY_SCORE = 40;
    const MAX_TOTAL_SCORE = 100;
    const SEVERITY_POINTS = {
        Critical: 30,
        High: 25,
        High20: 20,
        Medium: 15,
        Low: 10
    };

    function normalizeMonth(monthInput) {
        if (!monthInput) return DEFAULT_MONTH();
        if (monthInput instanceof Date) return monthInput.toISOString().slice(0, 7);
        if (typeof monthInput === 'string' && monthInput.length >= 7) return monthInput.slice(0, 7);
        return DEFAULT_MONTH();
    }

    function buildFieldMapping({ employees = [], payrollRecords = [] }) {
        const sampleEmployee = employees[0] || {};
        const samplePayroll = payrollRecords[0] || {};

        const employeeIdField = ['employeeId', 'id', 'empId'].find(key => key in sampleEmployee) || 'employeeId';
        const nameField = ['name', 'employeeName', 'fullName'].find(key => key in sampleEmployee) || 'name';
        const basicField = ['basicSalary', 'basic', 'salary'].find(key => key in samplePayroll || key in sampleEmployee) || 'basicSalary';
        const grossField = ['gross', 'monthlyGross', 'totalEarnings'].find(key => key in samplePayroll) || 'gross';
        const allowancesField = ['allowances', 'specialAllowance', 'otherAllowances'].find(key => key in samplePayroll) || 'allowances';
        const deductionField = ['deductions', 'totalDeductions'].find(key => key in samplePayroll) || 'deductions';
        const netField = ['netSalary', 'net'].find(key => key in samplePayroll) || 'netSalary';
        const pfField = ['pf', 'pfEmployeeContribution', 'pfDeduction'].find(key => key in samplePayroll) || 'pf';
        const esiField = ['esi', 'esiDeduction'].find(key => key in samplePayroll) || 'esi';
        const tdsField = ['tds', 'tdsDeduction'].find(key => key in samplePayroll) || 'tds';
        const panField = ['pan', 'PAN', 'panNumber'].find(key => key in sampleEmployee) || 'pan';
        const dojField = ['joinDate', 'dateOfJoining', 'doj'].find(key => key in sampleEmployee) || 'joinDate';
        const doeField = ['exitDate', 'lastWorkingDay', 'doe'].find(key => key in sampleEmployee) || 'exitDate';

        return {
            employeeIdField,
            nameField,
            basicField,
            grossField,
            allowancesField,
            deductionField,
            netField,
            pfField,
            esiField,
            tdsField,
            panField,
            dojField,
            doeField
        };
    }

    function normalizeEmployee(emp, mapping) {
        if (!emp) return {};
        return {
            employeeId: emp[mapping.employeeIdField] || emp.id || emp.employeeId,
            name: emp[mapping.nameField] || emp.name,
            basic: Number(emp[mapping.basicField]) || Number(emp.salary) || 0,
            gross: Number(emp[mapping.grossField]) || Number(emp.salary) || 0,
            pan: emp[mapping.panField] || emp.pan,
            pfApplicable: Boolean(emp.pfApplicable),
            esiApplicable: Boolean(emp.esiApplicable),
            joinDate: emp[mapping.dojField],
            exitDate: emp[mapping.doeField],
            raw: emp
        };
    }

    function normalizePayroll(record, mapping) {
        if (!record) return {};
        const gross = Number(record[mapping.grossField]);
        const allowances = Number(record[mapping.allowancesField]);
        const basic = Number(record[mapping.basicField]);
        const computedGross = (Number.isFinite(gross) ? gross : 0) || (Number.isFinite(basic) ? basic : 0) + (Number.isFinite(allowances) ? allowances : 0);

        return {
            employeeId: record[mapping.employeeIdField] || record.employeeId,
            period: record.period || record.month,
            paymentDate: record.paymentDate || record.createdAt,
            basic: Number.isFinite(basic) ? basic : 0,
            gross: computedGross,
            monthlyGross: computedGross,
            totalEarnings: computedGross,
            deductions: Number(record[mapping.deductionField]) || 0,
            net: Number(record[mapping.netField]) || Number(record.netSalary) || 0,
            pf: Number(record[mapping.pfField]) || 0,
            esi: Number(record[mapping.esiField]) || 0,
            tds: Number(record[mapping.tdsField]) || 0,
            raw: record
        };
    }

    function normalizeAttendance(attendanceRecords, monthKey) {
        const summaryByEmployee = {};
        Object.entries(attendanceRecords || {}).forEach(([date, records]) => {
            if (!date.startsWith(monthKey)) return;
            Object.entries(records || {}).forEach(([empId, record]) => {
                const status = record?.status;
                if (!summaryByEmployee[empId]) {
                    summaryByEmployee[empId] = { presentDays: 0, leaveDays: 0 };
                }
                if (status === 'present' || status === 'late' || status === 'halfday') {
                    summaryByEmployee[empId].presentDays += 1;
                }
                if (status === 'leave') {
                    summaryByEmployee[empId].leaveDays += 1;
                }
            });
        });
        return summaryByEmployee;
    }

    function buildPayrollHistory(payrollRecords, mapping) {
        const historyByEmployee = {};
        payrollRecords.forEach(record => {
            const normalized = normalizePayroll(record, mapping);
            const empId = normalized.employeeId;
            if (!empId) return;
            historyByEmployee[empId] = historyByEmployee[empId] || [];
            historyByEmployee[empId].push({
                ...normalized,
                payDate: normalized.paymentDate ? new Date(normalized.paymentDate) : null
            });
        });

        Object.values(historyByEmployee).forEach(list => list.sort((a, b) => {
            const aDate = a.payDate ? a.payDate.getTime() : 0;
            const bDate = b.payDate ? b.payDate.getTime() : 0;
            return aDate - bDate;
        }));

        return historyByEmployee;
    }

    function withinMonth(employee, monthKey) {
        if (!employee) return false;
        const [year, month] = monthKey.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        const join = employee.joinDate ? new Date(employee.joinDate) : null;
        const exit = employee.exitDate ? new Date(employee.exitDate) : null;

        const joined = join ? join <= end : true;
        const notExited = exit ? exit >= start : true;
        return joined && notExited;
    }

    function riskLevel(totalScore) {
        if (totalScore <= 20) return 'Low';
        if (totalScore <= 50) return 'Medium';
        if (totalScore <= 75) return 'High';
        return 'Critical';
    }

    function capScore(score) {
        return Math.min(score, MAX_CATEGORY_SCORE);
    }

    function dedupeEvents(events) {
        const seen = new Set();
        return events.filter(evt => {
            const key = [evt.ruleId, evt.employeeId, evt.category].join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function generateFixSuggestions(events) {
        if (!Array.isArray(events)) return [];
        const suggestions = new Set();
        const rules = {
            PF: 'Deduct PF for eligible employees with Basic ≤ ₹15,000',
            PF40: 'Review salary structure: Basic < 40% of Gross',
            ESI: 'Check employees near ₹21,000 for ESI eligibility fluctuations',
            TDS: 'Review high-salary employees with zero TDS (check declarations)',
            DEPOSITS: 'Record statutory deposit dates to reduce notice risk'
        };

        events.forEach(evt => {
            if (evt.ruleId === 'PF-R1' || evt.ruleId === 'PF-R7') suggestions.add(rules.PF);
            if (evt.ruleId === 'PF-R3') suggestions.add(rules.PF40);
            if (evt.ruleId === 'ESI-R2') suggestions.add(rules.ESI);
            if (evt.ruleId === 'TDS-R2') suggestions.add(rules.TDS);
            if (['PF-R2', 'ESI-R4', 'TDS-R5', 'TDS-R1'].includes(evt.ruleId)) suggestions.add(rules.DEPOSITS);
        });

        return Array.from(suggestions).slice(0, 5);
    }

    function runComplianceRiskEngine({ month, employees = [], attendance = {}, payroll = [], statutoryPayments = {} } = {}) {
        const monthKey = normalizeMonth(month);
        const mapping = buildFieldMapping({ employees, payrollRecords: payroll });
        const attendanceSummary = normalizeAttendance(attendance, monthKey);
        const payrollHistory = buildPayrollHistory(payroll, mapping);
        const rules = window.ComplianceRulesIndia || window.complianceRulesIndia;

        console.log('[ComplianceRisk] Engine start', {
            month: monthKey,
            employees: employees?.length || 0,
            payroll: payroll?.length || 0,
            attendanceDates: Object.keys(attendance || {}).length
        });

        const events = [];
        const categoryScore = { pf: 0, esi: 0, tds: 0, labor: 0 };

        const panMap = new Map();
        const duplicatePanEmployees = new Set();
        employees.forEach(emp => {
            const normalized = normalizeEmployee(emp, mapping);
            const pan = normalized.pan;
            if (pan) {
                if (panMap.has(pan)) {
                    duplicatePanEmployees.add(normalized.employeeId);
                    duplicatePanEmployees.add(panMap.get(pan));
                } else {
                    panMap.set(pan, normalized.employeeId);
                }
            }
        });

        if (!rules) {
            console.warn('[ComplianceRisk] Rules not loaded; returning empty result');
        }

        employees.forEach(emp => {
            const normalized = normalizeEmployee(emp, mapping);
            if (!normalized.employeeId || !withinMonth(normalized, monthKey)) return;

            const attendanceForEmp = attendanceSummary[normalized.employeeId] || attendanceSummary[emp.id] || { presentDays: 0, leaveDays: 0 };
            const history = payrollHistory[normalized.employeeId] || payrollHistory[emp.id] || [];
            const payrollSnapshot = history.length ? history[history.length - 1] : normalizePayroll({}, mapping);
            const duplicatePan = duplicatePanEmployees.has(normalized.employeeId);

            if (rules) {
                const pfEvents = rules.evaluatePfRules({ employee: normalized, payrollSnapshot, attendanceSummary: attendanceForEmp, history, statutoryPayments });
                pfEvents.forEach(evt => events.push({ ...evt, category: 'PF', employeeId: normalized.employeeId, employeeName: normalized.name, date: payrollSnapshot.paymentDate || payrollSnapshot.period || monthKey }));

                const esiEvents = rules.evaluateEsiRules({ employee: normalized, payrollSnapshot, attendanceSummary: attendanceForEmp, history, statutoryPayments });
                esiEvents.forEach(evt => events.push({ ...evt, category: 'ESI', employeeId: normalized.employeeId, employeeName: normalized.name, date: payrollSnapshot.paymentDate || payrollSnapshot.period || monthKey }));

                const tdsEvents = rules.evaluateTdsRules({ employee: normalized, payrollSnapshot, history, duplicatePan, statutoryPayments });
                tdsEvents.forEach(evt => events.push({ ...evt, category: 'TDS', employeeId: normalized.employeeId, employeeName: normalized.name, date: payrollSnapshot.paymentDate || payrollSnapshot.period || monthKey }));
            }
        });

        const deduped = dedupeEvents(events);
        deduped.forEach(evt => {
            const severityScore = SEVERITY_POINTS[evt.severity] || SEVERITY_POINTS[`${evt.severity}20`] || 0;
            if (evt.category === 'PF') categoryScore.pf += evt.score || severityScore;
            if (evt.category === 'ESI') categoryScore.esi += evt.score || severityScore;
            if (evt.category === 'TDS') categoryScore.tds += evt.score || severityScore;
        });

        categoryScore.pf = capScore(categoryScore.pf);
        categoryScore.esi = capScore(categoryScore.esi);
        categoryScore.tds = capScore(categoryScore.tds);

        const totalScore = Math.min(categoryScore.pf + categoryScore.esi + categoryScore.tds + categoryScore.labor, MAX_TOTAL_SCORE);
        const level = riskLevel(totalScore);

        const result = {
            month: monthKey,
            categoryScore,
            totalScore,
            level,
            events: deduped,
            suggestions: generateFixSuggestions(deduped),
            generatedAt: new Date().toISOString()
        };

        console.log('[ComplianceRisk] Engine result', result);
        return result;
    }

    function runComplianceRiskDevHarness() {
        const today = new Date();
        const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const employees = [
            { employeeId: 'EMP-PF', name: 'PF Missing', salary: 12000, pfApplicable: true },
            { employeeId: 'EMP-ESI', name: 'ESI Threshold', salary: 21000 },
            { employeeId: 'EMP-TDS', name: 'TDS High Salary', salary: 120000 }
        ];

        const attendance = {
            [`${monthKey}-05`]: {
                'EMP-PF': { status: 'present' },
                'EMP-ESI': { status: 'present' },
                'EMP-TDS': { status: 'present' }
            }
        };

        const payroll = [
            { employeeId: 'EMP-PF', basicSalary: 12000, allowances: 3000, deductions: 0, netSalary: 15000, paymentDate: `${monthKey}-28` },
            { employeeId: 'EMP-ESI', basicSalary: 19000, allowances: 1500, deductions: 500, esi: 0, netSalary: 20000, paymentDate: `${monthKey}-28` },
            { employeeId: 'EMP-TDS', basicSalary: 100000, allowances: 20000, deductions: 0, tds: 0, netSalary: 120000, paymentDate: `${monthKey}-28` }
        ];

        const result = runComplianceRiskEngine({ month: monthKey, employees, attendance, payroll });
        console.log('Compliance Risk Dev Harness', result);
        return result;
    }

    window.runComplianceRiskEngine = runComplianceRiskEngine;
    window.runComplianceRiskDevHarness = runComplianceRiskDevHarness;
    window.buildFieldMapping = buildFieldMapping;
})(window);
