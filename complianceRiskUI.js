(function(window) {
    const LEVEL_COLORS = {
        Low: '#2ecc71',
        Medium: '#f1c40f',
        High: '#e67e22',
        Critical: '#e74c3c'
    };

    function getCurrentMonthValue() {
        const monthPicker = document.getElementById('payrollReportMonth') || document.getElementById('month-select');
        if (monthPicker && monthPicker.value) return monthPicker.value;
        return new Date().toISOString().slice(0, 7);
    }

    function renderScoreCard(result) {
        const scoreElement = document.getElementById('compliance-risk-score');
        const levelElement = document.getElementById('compliance-risk-level');
        const pfChip = document.getElementById('pf-risk-score');
        const esiChip = document.getElementById('esi-risk-score');
        const tdsChip = document.getElementById('tds-risk-score');
        const suggestionList = document.getElementById('compliance-risk-suggestions');

        if (!scoreElement) return;

        scoreElement.textContent = result?.totalScore ?? 0;
        scoreElement.style.color = LEVEL_COLORS[result.level] || 'var(--primary-color)';

        if (levelElement) {
            levelElement.textContent = result.level || 'Low';
            levelElement.style.backgroundColor = LEVEL_COLORS[result.level] || 'var(--primary-color)';
        }

        if (pfChip) pfChip.textContent = `PF: ${result?.categoryScore?.pf || 0}`;
        if (esiChip) esiChip.textContent = `ESI: ${result?.categoryScore?.esi || 0}`;
        if (tdsChip) tdsChip.textContent = `TDS: ${result?.categoryScore?.tds || 0}`;

        if (suggestionList) {
            suggestionList.innerHTML = '';
            const suggestions = result?.suggestions || [];
            if (suggestions.length === 0) {
                suggestionList.innerHTML = '<li>No major risks detected for this month.</li>';
            } else {
                suggestions.forEach(text => {
                    const li = document.createElement('li');
                    li.textContent = text;
                    suggestionList.appendChild(li);
                });
            }
        }
    }

    function renderTopEvents(result) {
        const list = document.getElementById('compliance-risk-events');
        if (!list) return;
        list.innerHTML = '';
        const events = (result?.events || []).slice(0, 8);
        if (events.length === 0) {
            list.innerHTML = '<div class="anomaly-empty">No major risks detected for this month.</div>';
            return;
        }

        events.forEach(evt => {
            const item = document.createElement('div');
            item.className = 'compliance-event';
            const severityClass = (evt.severity || '').toLowerCase();
            item.innerHTML = `
                <div class="compliance-event__header">
                    <span class="badge ${severityClass}">${evt.category} • ${evt.severity}</span>
                    <span class="compliance-event__date">${evt.date || ''}</span>
                </div>
                <div class="compliance-event__title">${evt.employeeName || evt.employeeId || 'Unknown Employee'}</div>
                <div class="compliance-event__desc">${evt.description || ''}</div>
            `;
            list.appendChild(item);
        });
    }

    function renderAllEvents(result) {
        const modalBody = document.getElementById('compliance-risk-modal-body');
        const filterCategory = document.getElementById('compliance-filter-category');
        const filterSeverity = document.getElementById('compliance-filter-severity');

        if (!modalBody) return;
        modalBody.innerHTML = '';

        const events = result?.events || [];
        const category = filterCategory?.value || 'all';
        const severity = filterSeverity?.value || 'all';

        const filtered = events.filter(evt => {
            const catMatch = category === 'all' || evt.category === category;
            const sevMatch = severity === 'all' || evt.severity === severity;
            return catMatch && sevMatch;
        });

        if (filtered.length === 0) {
            modalBody.innerHTML = '<div class="anomaly-empty">No matching events for this filter.</div>';
            return;
        }

        filtered.forEach(evt => {
            const row = document.createElement('div');
            row.className = 'compliance-event compliance-event--row';
            row.innerHTML = `
                <div><strong>${evt.employeeName || evt.employeeId}</strong><div class="text-muted">${evt.category}</div></div>
                <div>${evt.severity}</div>
                <div>${evt.description}</div>
            `;
            modalBody.appendChild(row);
        });
    }

    function exportComplianceCSV(result) {
        if (!result?.events?.length) {
            alert('No risk events to export.');
            return;
        }
        const rows = [
            ['Category', 'Severity', 'Employee ID', 'Employee Name', 'Date', 'Description', 'Rule'],
            ...result.events.map(evt => [evt.category, evt.severity, evt.employeeId || '', evt.employeeName || '', evt.date || '', evt.description || '', evt.ruleId || ''])
        ];
        const csv = rows.map(r => r.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `compliance-risk-${result.month}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function attachModalHandlers(resultRef) {
        const openBtn = document.getElementById('compliance-view-all');
        const exportBtn = document.getElementById('compliance-export');
        const closeBtn = document.getElementById('compliance-risk-modal-close');
        const modal = document.getElementById('compliance-risk-modal');
        const filters = document.querySelectorAll('#compliance-filter-category, #compliance-filter-severity');

        if (openBtn && modal) {
            openBtn.onclick = () => {
                modal.style.display = 'block';
                renderAllEvents(resultRef.value);
            };
        }
        if (closeBtn && modal) {
            closeBtn.onclick = () => modal.style.display = 'none';
        }
        if (exportBtn) {
            exportBtn.onclick = () => exportComplianceCSV(resultRef.value);
        }
        filters.forEach(filter => filter?.addEventListener('change', () => renderAllEvents(resultRef.value)));

        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    function updateComplianceRiskUI() {
        if (typeof window.runComplianceRiskEngine !== 'function') return;
        const monthValue = getCurrentMonthValue();
        const result = window.runComplianceRiskEngine({
            month: monthValue,
            employees: window.employees || [],
            attendance: window.attendanceRecords || {},
            payroll: window.payrollRecords || [],
            statutoryPayments: window.statutoryPayments || {}
        });

        updateComplianceRiskUI.lastResult = result;
        renderScoreCard(result);
        renderTopEvents(result);
        renderAllEvents(result);
        return result;
    }

    window.updateComplianceRiskUI = updateComplianceRiskUI;

    document.addEventListener('DOMContentLoaded', () => {
        attachModalHandlers({ get value() { return updateComplianceRiskUI.lastResult; } });
    });
})(window);
// 🔹 Expose UI renderer globally
window.renderComplianceRisk = renderComplianceRisk;

