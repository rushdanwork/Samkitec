(function(window) {
    const SEVERITY_SCORES = {
        critical: 30,
        high25: 25,
        high20: 20,
        high15: 15,
        medium: 15,
        low: 10
    };

    function safeNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
    }

    function pfApplicable(employee, payrollSnapshot) {
        const basic = safeNumber(payrollSnapshot?.basic || employee?.basic);
        return Boolean(employee?.pfApplicable) || basic <= 15000;
    }

    function esiApplicable(employee, payrollSnapshot) {
        const gross = safeNumber(payrollSnapshot?.gross || payrollSnapshot?.monthlyGross || employee?.gross);
        return Boolean(employee?.esiApplicable) || gross <= 21000;
    }

    function evaluatePfRules({ employee, payrollSnapshot, attendanceSummary, history, statutoryPayments }) {
        const events = [];
        const applies = pfApplicable(employee, payrollSnapshot);
        const pfDeduction = safeNumber(payrollSnapshot?.pf);
        const basic = safeNumber(payrollSnapshot?.basic || employee?.basic);
        const gross = safeNumber(payrollSnapshot?.gross || payrollSnapshot?.monthlyGross || payrollSnapshot?.totalEarnings);
        const presentDays = attendanceSummary?.presentDays || 0;

        if (applies && pfDeduction === 0) {
            events.push({
                ruleId: 'PF-R1',
                severity: 'Critical',
                score: SEVERITY_SCORES.critical,
                description: 'PF eligible but employee contribution is missing in payroll.'
            });
        }

        if (gross > 0 && basic / gross < 0.4) {
            events.push({
                ruleId: 'PF-R3',
                severity: 'Medium',
                score: SEVERITY_SCORES.medium,
                description: 'Basic salary is below 40% of gross. This can attract PF scrutiny.'
            });
        }

        if (gross >= 14000 && gross <= 16000 && !applies) {
            events.push({
                ruleId: 'PF-R4',
                severity: 'Medium',
                score: SEVERITY_SCORES.medium,
                description: 'Gross between ₹14k–₹16k without PF. Check if PF avoidance pattern exists.'
            });
        }

        if (history?.length > 1) {
            const prev = history[history.length - 2];
            const prevPf = safeNumber(prev?.pf);
            if (prevPf > 0) {
                const delta = Math.abs(pfDeduction - prevPf) / prevPf;
                if (delta > 0.2) {
                    events.push({
                        ruleId: 'PF-R6',
                        severity: 'Medium',
                        score: SEVERITY_SCORES.medium,
                        description: 'PF amount fluctuated more than 20% month over month without recorded revision.'
                    });
                }
            }
        }

        if (presentDays > 0 && pfDeduction === 0 && applies) {
            events.push({
                ruleId: 'PF-R7',
                severity: 'High',
                score: SEVERITY_SCORES.high20,
                description: 'Employee has attendance but PF is not deducted.'
            });
        }

        if (statutoryPayments?.pfPaidDate) {
            const payDate = new Date(statutoryPayments.pfPaidDate);
            if (!isNaN(payDate)) {
                const paidMonth = payDate.getMonth();
                const paidYear = payDate.getFullYear();
                const dueMonth = (paidMonth + 11) % 12; // previous month
                const dueYear = paidMonth === 0 ? paidYear - 1 : paidYear;
                const dueDate = new Date(dueYear, dueMonth + 1, 15); // 15th of next month
                if (payDate > dueDate) {
                    events.push({
                        ruleId: 'PF-R2',
                        severity: 'High',
                        score: SEVERITY_SCORES.high20,
                        description: 'PF deposit date is after the 15th of next month.'
                    });
                }
            }
        }

        return events;
    }

    function evaluateEsiRules({ employee, payrollSnapshot, attendanceSummary, history, statutoryPayments }) {
        const events = [];
        const applies = esiApplicable(employee, payrollSnapshot);
        const gross = safeNumber(payrollSnapshot?.gross || payrollSnapshot?.monthlyGross || employee?.gross);
        const esiDeduction = safeNumber(payrollSnapshot?.esi);
        const presentDays = attendanceSummary?.presentDays || 0;

        if (applies && esiDeduction === 0) {
            events.push({
                ruleId: 'ESI-R1',
                severity: 'Critical',
                score: SEVERITY_SCORES.critical,
                description: 'ESI eligible but deduction is missing.'
            });
        }

        if (history?.length >= 3) {
            const lastGross = safeNumber(history[history.length - 1]?.gross || history[history.length - 1]?.monthlyGross);
            const prevGross = safeNumber(history[history.length - 2]?.gross || history[history.length - 2]?.monthlyGross);
            const thirdGross = safeNumber(history[history.length - 3]?.gross || history[history.length - 3]?.monthlyGross);
            const oscillatesAroundThreshold = [lastGross, prevGross, thirdGross].some(val => val >= 20000 && val <= 22000);
            if (oscillatesAroundThreshold) {
                events.push({
                    ruleId: 'ESI-R2',
                    severity: 'Medium',
                    score: SEVERITY_SCORES.medium,
                    description: 'Gross salary oscillates around ₹21,000 threshold. Verify ESI applicability each month.'
                });
            }
        }

        if (esiDeduction > 0 && presentDays === 0) {
            events.push({
                ruleId: 'ESI-R3',
                severity: 'Low',
                score: SEVERITY_SCORES.low,
                description: 'ESI deducted while no attendance recorded this month.'
            });
        }

        if (statutoryPayments?.esiPaidDate) {
            const payDate = new Date(statutoryPayments.esiPaidDate);
            if (!isNaN(payDate)) {
                const paidMonth = payDate.getMonth();
                const paidYear = payDate.getFullYear();
                const dueMonth = (paidMonth + 11) % 12; // previous month
                const dueYear = paidMonth === 0 ? paidYear - 1 : paidYear;
                const dueDate = new Date(dueYear, dueMonth + 1, 15);
                if (payDate > dueDate) {
                    events.push({
                        ruleId: 'ESI-R4',
                        severity: 'High',
                        score: SEVERITY_SCORES.high20,
                        description: 'ESI deposit date is after the 15th of next month.'
                    });
                }
            }
        }

        if (employee?.exitDate) {
            const exitDate = new Date(employee.exitDate);
            const joinDate = employee.joinDate ? new Date(employee.joinDate) : null;
            const tenureMs = joinDate && !isNaN(joinDate) ? Math.abs(exitDate - joinDate) : null;
            if (!isNaN(exitDate) && tenureMs && tenureMs / (1000 * 60 * 60 * 24) <= 30 && esiDeduction > 0) {
                events.push({
                    ruleId: 'ESI-R5',
                    severity: 'Low',
                    score: SEVERITY_SCORES.low,
                    description: 'ESI deducted for an employee exiting within 30 days.'
                });
            }
        }

        return events;
    }

    function evaluateTdsRules({ employee, payrollSnapshot, history, duplicatePan, statutoryPayments }) {
        const events = [];
        const gross = safeNumber(payrollSnapshot?.gross || payrollSnapshot?.monthlyGross || payrollSnapshot?.totalEarnings);
        const tds = safeNumber(payrollSnapshot?.tds);

        if (tds > 0 && !statutoryPayments?.tdsPaidDate && !statutoryPayments?.tdsChallanDate) {
            events.push({
                ruleId: 'TDS-R1',
                severity: 'Critical',
                score: SEVERITY_SCORES.critical,
                description: 'TDS deducted but deposit/challan date not recorded.'
            });
        }

        const annualApprox = gross * 12;
        if (annualApprox > 1000000 && tds === 0) {
            events.push({
                ruleId: 'TDS-R2',
                severity: 'High',
                score: SEVERITY_SCORES.high25,
                description: 'High annual income with zero TDS. Verify declarations/investments.'
            });
        }

        if (history?.length >= 3) {
            const lastTwoTdsSame = safeNumber(history[history.length - 1]?.tds) === safeNumber(history[history.length - 2]?.tds);
            const salaryChanged = safeNumber(history[history.length - 1]?.gross) !== safeNumber(history[history.length - 2]?.gross);
            if (lastTwoTdsSame && salaryChanged) {
                events.push({
                    ruleId: 'TDS-R3',
                    severity: 'Medium',
                    score: SEVERITY_SCORES.medium,
                    description: 'Salary changed but TDS unchanged for 2 consecutive months.'
                });
            }
        }

        if (duplicatePan) {
            events.push({
                ruleId: 'TDS-R4',
                severity: 'High',
                score: SEVERITY_SCORES.high20,
                description: 'Duplicate PAN detected across employees. This needs correction.'
            });
        }

        if (statutoryPayments?.tdsPaidDate) {
            const payDate = new Date(statutoryPayments.tdsPaidDate);
            if (!isNaN(payDate)) {
                const paidMonth = payDate.getMonth();
                const paidYear = payDate.getFullYear();
                const dueMonth = (paidMonth + 11) % 12;
                const dueYear = paidMonth === 0 ? paidYear - 1 : paidYear;
                const dueDate = new Date(dueYear, dueMonth + 1, 7);
                if (payDate > dueDate) {
                    events.push({
                        ruleId: 'TDS-R5',
                        severity: 'High',
                        score: SEVERITY_SCORES.high15,
                        description: 'TDS deposit recorded after 7th of next month.'
                    });
                }
            }
        }

        return events;
    }

    window.complianceRulesIndia = {
        evaluatePfRules,
        evaluateEsiRules,
        evaluateTdsRules,
        safeNumber,
        SEVERITY_SCORES
    };
})(window);
// 🔹 Expose India compliance rules globally
window.ComplianceRulesIndia = {
  pfRules,
  esiRules,
  tdsRules
};
