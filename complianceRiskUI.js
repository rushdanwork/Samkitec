(function (window) {
    const RULE_ORDER = ['pf', 'esi', 'tds', 'pt', 'minWage', 'attendance', 'salaryAnomaly'];

    const capitalize = (value) => value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '';
    const formatTimestamp = (value) => {
        if (!value) return '--';
        if (typeof value?.toDate === 'function') return value.toDate().toLocaleString();
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString();
    };

    const ensureComplianceRunSelector = () => {
        const topbar = document.querySelector('#compliance-manager .compliance-topbar');
        if (!topbar || document.getElementById('compliance-run-selector')) return;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '10px';
        wrapper.innerHTML = `
            <label for="compliance-run-selector" class="text-muted">Payroll Run</label>
            <select id="compliance-run-selector" class="form-control" style="min-width: 220px;"></select>
        `;
        topbar.insertBefore(wrapper, topbar.firstChild);
    };

    const renderSummary = (employeeSummaries) => {
        const summaryHigh = employeeSummaries.filter((item) => item.severity === 'high').length;
        const summaryMedium = employeeSummaries.filter((item) => item.severity === 'medium').length;
        const summaryLow = employeeSummaries.filter((item) => item.severity === 'low').length;

        const totalScore = employeeSummaries.reduce((sum, item) => sum + (Number(item.riskScore) || 0), 0);
        const avgScore = employeeSummaries.length ? Math.round(totalScore / employeeSummaries.length) : 0;
        const lastTs = employeeSummaries
            .map((item) => item.timestamp)
            .filter(Boolean)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        setText('compliance-summary-high', summaryHigh);
        setText('compliance-summary-medium', summaryMedium);
        setText('compliance-summary-low', summaryLow);
        setText('compliance-score-value', avgScore);
        setText('compliance-last-scan', formatTimestamp(lastTs));
        setText('compliance-summary-last-scan', formatTimestamp(lastTs));
    };

    const renderEmployeeTable = (employeeResults) => {
        const tableBody = document.getElementById('compliance-risk-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        employeeResults.forEach((result) => {
            const severity = result.summary?.severity || 'low';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.summary?.employeeName || result.employeeId}</td>
                <td>${result.summary?.riskScore ?? 0}</td>
                <td><span class="severity-chip severity-${severity}">${capitalize(severity)}</span></td>
                <td>${result.summary?.violationCount ?? 0}</td>
                <td><button class="btn btn-outline view-compliance-details" data-employee="${result.employeeId}">Expand</button></td>
            `;
            tableBody.appendChild(row);

            const detailRow = document.createElement('tr');
            detailRow.id = `compliance-rule-row-${result.employeeId}`;
            detailRow.style.display = 'none';
            const rulesHtml = RULE_ORDER.map((ruleKey) => {
                const rule = result.rules?.[ruleKey] || {};
                const sev = rule.severity || 'low';
                return `
                    <div style="padding: 8px; border-bottom: 1px solid #eee;">
                        <strong>${ruleKey}</strong>
                        <span class="severity-chip severity-${sev}" style="margin-left: 8px;">${capitalize(sev)}</span>
                        <div>Passed: ${rule.passed ? 'Yes' : 'No'}</div>
                        <div>Reason: ${rule.reason || '--'}</div>
                        <div class="text-muted">Expected: ${JSON.stringify(rule.expected ?? null)}</div>
                        <div class="text-muted">Actual: ${JSON.stringify(rule.actual ?? null)}</div>
                    </div>
                `;
            }).join('');

            detailRow.innerHTML = `<td colspan="5">${rulesHtml}</td>`;
            tableBody.appendChild(detailRow);
        });
    };

    const renderRiskCards = (employeeResults) => {
        const container = document.getElementById('compliance-risk-cards');
        if (!container) return;

        container.innerHTML = '';
        if (!employeeResults.length) {
            container.innerHTML = '<div class="anomaly-empty">No compliance results available for this payroll run.</div>';
            return;
        }

        employeeResults.forEach((result) => {
            const severity = result.summary?.severity || 'low';
            const card = document.createElement('div');
            card.className = `risk-card fade-in severity-${severity}`;
            card.innerHTML = `
                <div class="risk-card__header">
                    <span><strong>${result.summary?.employeeName || result.employeeId}</strong></span>
                    <span class="severity-chip severity-${severity}">${capitalize(severity)}</span>
                </div>
                <div class="text-muted">Violations: ${result.summary?.violationCount ?? 0}</div>
                <div class="text-muted">Risk Score: ${result.summary?.riskScore ?? 0}</div>
            `;
            container.appendChild(card);
        });
    };

    const loadRunResults = async (runId) => {
        if (!runId || !window.firebaseDb || !window.firestoreFunctions) return [];

        const { doc, getDoc } = window.firestoreFunctions;
        const db = window.firebaseDb;
        const metaSnap = await getDoc(doc(db, 'complianceResults', runId, '_meta', 'scanInfo'));
        const employeeIds = metaSnap.exists() ? (metaSnap.data()?.employeeIds || []) : [];

        const results = await Promise.all(employeeIds.map(async (employeeId) => {
            const [summarySnap, rulesSnap] = await Promise.all([
                getDoc(doc(db, 'complianceResults', runId, employeeId, 'summary')),
                getDoc(doc(db, 'complianceResults', runId, employeeId, 'rules')),
            ]);

            return {
                employeeId,
                summary: summarySnap.exists() ? summarySnap.data() : {},
                rules: rulesSnap.exists() ? rulesSnap.data() : {},
            };
        }));

        return results.sort((a, b) => (b.summary?.riskScore || 0) - (a.summary?.riskScore || 0));
    };

    const loadPayrollRuns = async () => {
        if (!window.firebaseDb || !window.firestoreFunctions) return [];
        const { collection, getDocs, orderBy, query } = window.firestoreFunctions;
        const snapshot = await getDocs(query(collection(window.firebaseDb, 'payrollRecords'), orderBy('generatedAt', 'desc')));
        return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    };

    const bindInteractions = (state) => {
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
                    await window.runComplianceScan(state.selectedRunId || 'manual');
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

        const state = { selectedRunId: null };
        bindInteractions(state);

        const renderRun = async (runId) => {
            state.selectedRunId = runId;
            const results = await loadRunResults(runId);
            renderSummary(results.map((item) => item.summary || {}));
            renderRiskCards(results);
            renderEmployeeTable(results);
        };

        const runs = await loadPayrollRuns();
        selector.innerHTML = runs.length
            ? runs.map((run) => `<option value="${run.id}">${run.month || '--'}/${run.year || '--'} • ${run.id.slice(0, 8)}</option>`).join('')
            : '<option value="">No payroll runs found</option>';

        if (runs[0]?.id) {
            await renderRun(runs[0].id);
        }

        selector.onchange = async () => {
            await renderRun(selector.value);
        };

        window.addEventListener('complianceScanCompleted', async (event) => {
            if (!state.selectedRunId || event?.detail?.runId === state.selectedRunId) {
                await renderRun(state.selectedRunId || event?.detail?.runId);
            }
        });
    };

    window.addEventListener('DOMContentLoaded', () => {
        const ensureReady = () => {
            if (window.firebaseDb && window.firestoreFunctions) {
                init().catch((error) => {
                    console.error('[ComplianceUI] Failed to initialize new compliance UI.', error);
                });
                return;
            }
            window.setTimeout(ensureReady, 500);
        };
        ensureReady();
    });
})(window);
