(function(window) {
    const SEVERITY_CLASS = {
        Low: 'severity-low',
        Medium: 'severity-medium',
        High: 'severity-high'
    };

    const formatTimestamp = (value) => {
        if (!value) return '--';
        if (typeof value?.toDate === 'function') return value.toDate().toLocaleString();
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString();
    };

    const ensureModal = () => {
        let modal = document.getElementById('compliance-detail-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'compliance-detail-modal';
        modal.className = 'compliance-modal';
        modal.innerHTML = `
            <div class="compliance-modal__content">
                <div class="compliance-modal__header">
                    <h3>Employee Risk Details</h3>
                    <button class="compliance-modal__close" id="compliance-detail-close">&times;</button>
                </div>
                <div id="compliance-detail-body" class="compliance-modal__body"></div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    };

    const renderSummary = (reports) => {
        const high = reports.filter((report) => report.summary?.riskLevel === 'High').length;
        const medium = reports.filter((report) => report.summary?.riskLevel === 'Medium').length;
        const low = reports.filter((report) => report.summary?.riskLevel === 'Low').length;

        const highEl = document.getElementById('compliance-summary-high');
        const mediumEl = document.getElementById('compliance-summary-medium');
        const lowEl = document.getElementById('compliance-summary-low');
        if (highEl) highEl.textContent = high;
        if (mediumEl) mediumEl.textContent = medium;
        if (lowEl) lowEl.textContent = low;

        const scoreEl = document.getElementById('compliance-score-value');
        const lastScanEl = document.getElementById('compliance-last-scan');
        const lastScanChipEl = document.getElementById('compliance-summary-last-scan');
        const scores = reports.map((report) => report.summary?.riskScore ?? 0);
        const averageScore = scores.length
            ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
            : 0;

        if (scoreEl) scoreEl.textContent = `${averageScore}`;

        const lastEvaluated = reports
            .map((report) => report.summary?.lastEvaluated)
            .filter(Boolean)
            .sort((a, b) => {
                const aDate = typeof a?.toDate === 'function' ? a.toDate().getTime() : new Date(a).getTime();
                const bDate = typeof b?.toDate === 'function' ? b.toDate().getTime() : new Date(b).getTime();
                return bDate - aDate;
            })[0];

        const formattedLastScan = formatTimestamp(lastEvaluated);
        if (lastScanEl) lastScanEl.textContent = formattedLastScan;
        if (lastScanChipEl) lastScanChipEl.textContent = formattedLastScan;
    };

    const iconForSeverity = (severity) => {
        if (severity === 'High') return 'fa-circle-exclamation';
        if (severity === 'Medium') return 'fa-triangle-exclamation';
        return 'fa-circle-check';
    };

    const renderRiskCards = (reports) => {
        const container = document.getElementById('compliance-risk-cards');
        if (!container) return;
        container.innerHTML = '';

        const violations = reports.flatMap((report) =>
            (report.violations || []).map((violation) => ({
                ...violation,
                employeeName: report.summary?.employeeName,
            }))
        );

        if (violations.length === 0) {
            container.innerHTML = '<div class="anomaly-empty">No compliance risks detected for this cycle.</div>';
            return;
        }

        violations.slice(0, 8).forEach((violation) => {
            const card = document.createElement('div');
            card.className = `risk-card fade-in ${SEVERITY_CLASS[violation.severity] || ''}`;
            card.innerHTML = `
                <div class="risk-card__header">
                    <span class="risk-label ${violation.severity?.toLowerCase() || ''}">${violation.severity}</span>
                    <span class="text-muted">${violation.type}</span>
                </div>
                <div>
                    <strong>${violation.employeeName || 'Unknown Employee'}</strong>
                    <p class="text-muted">${violation.message}</p>
                </div>
                <div class="risk-actions">
                    <span class="severity-chip ${SEVERITY_CLASS[violation.severity] || ''}">
                        <i class="fas ${iconForSeverity(violation.severity)}"></i> ${violation.severity}
                    </span>
                </div>
            `;
            container.appendChild(card);
        });
    };

    const renderRiskTable = (reports) => {
        const tableBody = document.getElementById('compliance-risk-table-body');
        if (!tableBody) return;

        const sorted = [...reports].sort((a, b) => (b.summary?.riskScore ?? 0) - (a.summary?.riskScore ?? 0));
        tableBody.innerHTML = '';

        if (sorted.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-muted">No compliance reports available yet.</td>
                </tr>
            `;
            return;
        }

        sorted.forEach((report) => {
            const row = document.createElement('tr');
            const severityClass = SEVERITY_CLASS[report.summary?.riskLevel] || '';
            row.innerHTML = `
                <td>${report.summary?.employeeName || 'Unknown'}</td>
                <td>${report.summary?.riskScore ?? 0}</td>
                <td><span class="severity-chip ${severityClass}">${report.summary?.riskLevel || 'Low'}</span></td>
                <td><button class="btn btn-outline view-compliance-details" data-employee="${report.id}">View Details</button></td>
            `;
            tableBody.appendChild(row);
        });
    };

    const renderModalContent = (report) => {
        const modal = ensureModal();
        const modalBody = document.getElementById('compliance-detail-body');
        if (!modalBody || !report) return;

        const violations = report.violations || [];
        modalBody.innerHTML = `
            <div class="detail-summary">
                <div>
                    <strong>${report.summary?.employeeName || 'Unknown Employee'}</strong>
                    <div class="text-muted">Last evaluated: ${formatTimestamp(report.summary?.lastEvaluated)}</div>
                </div>
                <span class="severity-chip ${SEVERITY_CLASS[report.summary?.riskLevel] || ''}">
                    ${report.summary?.riskLevel || 'Low'} Risk
                </span>
            </div>
            <div class="detail-violations">
                ${violations.length === 0 ? '<div class="text-muted">No violations reported.</div>' : ''}
            </div>
        `;

        const listContainer = modalBody.querySelector('.detail-violations');
        violations.forEach((violation) => {
            const item = document.createElement('div');
            item.className = 'violation-item';
            item.innerHTML = `
                <div class="violation-item__header">
                    <span class="severity-chip ${SEVERITY_CLASS[violation.severity] || ''}">
                        <i class="fas ${iconForSeverity(violation.severity)}"></i> ${violation.severity}
                    </span>
                    <span class="text-muted">${violation.type}</span>
                </div>
                <div>${violation.message}</div>
                <div class="text-muted">Suggested fix: ${violation.recommendedFix}</div>
                <div class="text-muted">Logged: ${formatTimestamp(violation.timestamp)}</div>
            `;
            listContainer.appendChild(item);
        });

        modal.classList.add('open');
    };

    const attachInteractionHandlers = (reportsRef) => {
        const modal = ensureModal();
        const closeButton = document.getElementById('compliance-detail-close');
        if (closeButton) {
            closeButton.onclick = () => modal.classList.remove('open');
        }
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.classList.remove('open');
            }
        });

        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target?.classList?.contains('view-compliance-details')) {
                const report = reportsRef.value.find((item) => item.id === target.dataset.employee);
                renderModalContent(report);
            }
        });

        const runButton = document.getElementById('compliance-run-scan');
        if (runButton) {
            runButton.onclick = () => {
                if (typeof window.runComplianceScan === 'function') {
                    runButton.disabled = true;
                    runButton.textContent = 'Running Compliance Scan...';
                    window
                        .runComplianceScan('manual')
                        .catch(() => {})
                        .finally(() => {
                            runButton.disabled = false;
                            runButton.innerHTML = '<i class="fas fa-wave-square"></i> Run Compliance Scan';
                        });
                }
            };
        }
    };

    const listenComplianceReports = () => {
        if (!window.firebaseDb || !window.firestoreFunctions) return;
        const { collection, onSnapshot } = window.firestoreFunctions;

        onSnapshot(collection(window.firebaseDb, 'complianceViolations'), (snapshot) => {
            const reports = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            renderSummary(reports);
            renderRiskCards(reports);
            renderRiskTable(reports);
            listenComplianceReports.lastReports = reports;
        });
    };

    window.addEventListener('DOMContentLoaded', () => {
        const reportsRef = {
            get value() {
                return listenComplianceReports.lastReports || [];
            },
        };
        attachInteractionHandlers(reportsRef);
        const ensureReady = () => {
            if (window.firebaseDb && window.firestoreFunctions) {
                listenComplianceReports();
                return;
            }
            window.setTimeout(ensureReady, 1000);
        };
        ensureReady();
    });
})(window);
