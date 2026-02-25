(function (window) {
    const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

    const capitalize = (value) => value ? `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}` : '';

    const normalizeMonthOption = (run = {}) => {
        if (!run?.month || !run?.year) return { id: run.id, label: run.id || '--', monthKey: run.id || null };
        const monthNum = Number(run.month);
        const monthPart = Number.isFinite(monthNum)
            ? String(monthNum).padStart(2, '0')
            : String(run.month).slice(0, 2).padStart(2, '0');
        const monthKey = `${run.year}-${monthPart}`;
        return {
            id: monthKey,
            label: `${monthKey} • ${String(run.id || '').slice(0, 8)}`,
            monthKey,
        };
    };

    const ensureComplianceRunSelector = () => {
        const topbar = document.querySelector('#compliance-manager .compliance-topbar');
        if (!topbar || document.getElementById('compliance-run-selector')) return;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '10px';
        wrapper.innerHTML = `
            <label for="compliance-run-selector" class="text-muted">Month</label>
            <select id="compliance-run-selector" class="form-control" style="min-width: 220px;"></select>
        `;
        topbar.insertBefore(wrapper, topbar.firstChild);
    };

    const renderSummary = (events) => {
        const severityCount = events.reduce((acc, item) => {
            const key = String(item.severity || 'LOW').toUpperCase();
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        setText('compliance-summary-high', (severityCount.HIGH || 0) + (severityCount.CRITICAL || 0));
        setText('compliance-summary-medium', severityCount.MEDIUM || 0);
        setText('compliance-summary-low', severityCount.LOW || 0);
        setText('compliance-score-value', events.length);
        setText('compliance-last-scan', events.length ? 'From Firestore complianceEvents' : '--');
        setText('compliance-summary-last-scan', events.length ? 'From Firestore complianceEvents' : '--');
    };

    const groupViolationsByEmployee = (events) => {
        const grouped = new Map();
        events.forEach((event) => {
            const employeeId = event.employeeId || 'unknown';
            const existing = grouped.get(employeeId) || {
                employeeId,
                employeeName: event.employeeName || employeeId,
                severity: 'LOW',
                violations: [],
            };
            existing.violations.push(event);

            const currentIndex = SEVERITY_ORDER.indexOf(existing.severity);
            const nextSeverity = String(event.severity || 'LOW').toUpperCase();
            const nextIndex = SEVERITY_ORDER.indexOf(nextSeverity);
            if (nextIndex !== -1 && (currentIndex === -1 || nextIndex < currentIndex)) {
                existing.severity = nextSeverity;
            }

            grouped.set(employeeId, existing);
        });

        return Array.from(grouped.values()).sort((a, b) => {
            const aIndex = SEVERITY_ORDER.indexOf(a.severity);
            const bIndex = SEVERITY_ORDER.indexOf(b.severity);
            if (aIndex !== bIndex) return aIndex - bIndex;
            return b.violations.length - a.violations.length;
        });
    };

    const renderEmployeeTable = (events) => {
        const employeeResults = groupViolationsByEmployee(events);
        const tableBody = document.getElementById('compliance-risk-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        employeeResults.forEach((result) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.employeeName}</td>
                <td>${result.violations.length}</td>
                <td><span class="severity-chip severity-${result.severity.toLowerCase()}">${capitalize(result.severity)}</span></td>
                <td>${result.violations.map((item) => item.ruleId).join(', ')}</td>
                <td><button class="btn btn-outline view-compliance-details" data-employee="${result.employeeId}">Expand</button></td>
            `;
            tableBody.appendChild(row);

            const detailRow = document.createElement('tr');
            detailRow.id = `compliance-rule-row-${result.employeeId}`;
            detailRow.style.display = 'none';
            detailRow.innerHTML = `
                <td colspan="5">
                    ${result.violations.map((item) => `
                        <div style="padding: 8px; border-bottom: 1px solid #eee;">
                            <strong>${item.ruleId}</strong>
                            <span class="severity-chip severity-${String(item.severity || 'LOW').toLowerCase()}" style="margin-left: 8px;">
                                ${capitalize(item.severity)}
                            </span>
                            <div>${item.description || '--'}</div>
                            <div class="text-muted">Expected: ${item.expected || '--'}</div>
                            <div class="text-muted">Actual: ${item.actual || '--'}</div>
                            <div class="text-muted">Impact: ${item.impact || '--'}</div>
                        </div>
                    `).join('')}
                </td>
            `;
            tableBody.appendChild(detailRow);
        });

        if (!employeeResults.length) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-muted">No compliance violations found for this month.</td></tr>';
        }
    };

    const renderRiskCards = (events) => {
        const employeeResults = groupViolationsByEmployee(events);
        const container = document.getElementById('compliance-risk-cards');
        if (!container) return;

        container.innerHTML = '';
        if (!employeeResults.length) {
            container.innerHTML = '<div class="anomaly-empty">No compliance events available for this month.</div>';
            return;
        }

        employeeResults.forEach((result) => {
            const card = document.createElement('div');
            card.className = `risk-card fade-in severity-${result.severity.toLowerCase()}`;
            card.innerHTML = `
                <div class="risk-card__header">
                    <span><strong>${result.employeeName}</strong></span>
                    <span class="severity-chip severity-${result.severity.toLowerCase()}">${capitalize(result.severity)}</span>
                </div>
                <div class="text-muted">Violations: ${result.violations.length}</div>
                <div class="text-muted">Rules: ${result.violations.map((item) => item.ruleId).join(', ')}</div>
            `;
            container.appendChild(card);
        });
    };

    const loadComplianceEvents = async (monthKey) => {
        if (!monthKey || !window.firebaseDb || !window.firestoreFunctions) return [];

        const { collection, getDocs, query, where } = window.firestoreFunctions;
        const snapshot = await getDocs(
            query(collection(window.firebaseDb, 'complianceEvents'), where('scanMonth', '==', monthKey))
        );

        return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    };

    const loadPayrollRuns = async () => {
        if (!window.firebaseDb || !window.firestoreFunctions) return [];
        const { collection, getDocs, orderBy, query } = window.firestoreFunctions;
        const snapshot = await getDocs(query(collection(window.firebaseDb, 'payrollRecords'), orderBy('generatedAt', 'desc')));
        return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    };

    const bindInteractions = (state, renderMonth) => {
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (!target?.classList?.contains('view-compliance-details')) return;
            const employeeId = target.dataset.employee;
            const row = document.getElementById(`compliance-rule-row-${employeeId}`);
            if (!row) return;
            row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
        });

        const runButton = document.getElementById('compliance-run-scan');
        if (runButton) {
            runButton.onclick = async () => {
                if (typeof window.runComplianceScan !== 'function') return;
                runButton.disabled = true;
                runButton.textContent = 'Running Compliance Scan...';
                try {
                    await window.runComplianceScan(state.selectedMonth || 'manual');
                    await renderMonth(state.selectedMonth);
                } catch (error) {
                    console.error('[ComplianceUI] Failed to run compliance scan.', error);
                } finally {
                    runButton.disabled = false;
                    runButton.innerHTML = '<i class="fas fa-wave-square"></i> Run Compliance Scan';
                }
            };
        }
    };

    const init = async () => {
        ensureComplianceRunSelector();

        const selector = document.getElementById('compliance-run-selector');
        if (!selector) return;

        const state = { selectedMonth: null };

        const renderMonth = async (monthKey) => {
            if (!monthKey) return;
            state.selectedMonth = monthKey;
            const events = await loadComplianceEvents(monthKey);
            renderSummary(events);
            renderRiskCards(events);
            renderEmployeeTable(events);
        };

        bindInteractions(state, renderMonth);

        const runs = await loadPayrollRuns();
        const options = runs.map(normalizeMonthOption).filter((item) => item.monthKey);

        selector.innerHTML = options.length
            ? options.map((run) => `<option value="${run.monthKey}">${run.label}</option>`).join('')
            : '<option value="">No payroll runs found</option>';

        if (options[0]?.monthKey) {
            await renderMonth(options[0].monthKey);
        }

        selector.onchange = async () => {
            await renderMonth(selector.value);
        };

        window.addEventListener('complianceScanCompleted', async (event) => {
            const scanMonth = event?.detail?.month;
            if (!state.selectedMonth || scanMonth === state.selectedMonth) {
                await renderMonth(state.selectedMonth || scanMonth);
            }
        });
    };

    window.addEventListener('DOMContentLoaded', () => {
        const ensureReady = () => {
            if (window.firebaseDb && window.firestoreFunctions) {
                init().catch((error) => {
                    console.error('[ComplianceUI] Failed to initialize compliance UI.', error);
                });
                return;
            }
            window.setTimeout(ensureReady, 500);
        };
        ensureReady();
    });
})(window);
