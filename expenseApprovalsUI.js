(function(window) {
    const CATEGORY_LABELS = {
        travel: 'Travel',
        meals: 'Meals',
        office: 'Office',
        misc: 'Misc',
        fuel: 'Fuel'
    };

    const CATEGORY_CLASS = {
        meals: 'chip-meals',
        travel: 'chip-travel',
        office: 'chip-office',
        misc: 'chip-misc',
        fuel: 'chip-fuel'
    };

    const STATUS_CLASS = {
        submitted: 'status-amber',
        approved: 'status-green',
        rejected: 'status-red',
        paid: 'status-blue'
    };

    const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString()}`;

    const parseDate = (value) => {
        if (!value) return null;
        if (typeof value?.toDate === 'function') return value.toDate();
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const debounce = (callback, delay = 250) => {
        let timeoutId;
        return (...args) => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => callback(...args), delay);
        };
    };

    const state = {
        pending: [],
        approved: [],
        all: [],
        limits: [],
        initialized: false,
        pendingUnsub: null,
        approvedUnsub: null,
        allUnsub: null,
        limitsUnsub: null
    };

    const setBanner = (message, type = 'error') => {
        const banner = document.getElementById('expense-approval-banner');
        if (!banner) return;
        banner.textContent = message;
        banner.classList.toggle('is-visible', Boolean(message));
        banner.classList.toggle('is-error', type === 'error');
        banner.classList.toggle('is-success', type === 'success');
    };

    const setLoading = (loading) => {
        const skeleton = document.getElementById('expense-approvals-loading');
        if (skeleton) skeleton.style.display = loading ? 'block' : 'none';
    };

    const renderPendingList = () => {
        const list = document.getElementById('expense-approvals-list');
        if (!list) return;
        list.innerHTML = '';

        if (state.pending.length === 0) {
            list.innerHTML = '<div class="anomaly-empty">No pending approvals right now.</div>';
            return;
        }

        state.pending.forEach((expense) => {
            const card = document.createElement('div');
            card.className = 'expense-approval-card';
            card.innerHTML = `
                <div class="expense-approval-card__header">
                    <div>
                        <h4>${expense.employeeName || 'Employee'}</h4>
                        <div class="text-muted">${expense.vendor || 'Vendor'} · ${parseDate(expense.date)?.toLocaleDateString() || '—'}</div>
                    </div>
                    <span class="status-badge ${STATUS_CLASS[expense.status] || 'status-amber'}">${expense.status}</span>
                </div>
                <div class="expense-approval-card__meta">
                    <div class="expense-amount">${formatCurrency(expense.amount)}</div>
                    <span class="category-chip ${CATEGORY_CLASS[expense.category] || 'chip-misc'}">${CATEGORY_LABELS[expense.category] || expense.category}</span>
                </div>
                <div class="expense-approval-card__actions">
                    <button class="btn btn-outline btn-sm" data-action="view" data-id="${expense.id}">View Receipt</button>
                    <button class="btn btn-success btn-sm" data-action="approve" data-id="${expense.id}">Approve</button>
                    <button class="btn btn-danger btn-sm" data-action="reject" data-id="${expense.id}">Reject</button>
                </div>
            `;
            list.appendChild(card);
        });
    };

    const renderDashboard = () => {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const monthly = state.all.filter((expense) => {
            const dateValue = parseDate(expense.date || expense.createdAt);
            return dateValue && dateValue.toISOString().slice(0, 7) === currentMonth;
        });
        const totalSpend = monthly.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

        const categoryTotals = monthly.reduce((acc, expense) => {
            const category = expense.category || 'misc';
            acc[category] = (acc[category] || 0) + (Number(expense.amount) || 0);
            return acc;
        }, {});

        const vendorTotals = monthly.reduce((acc, expense) => {
            const vendor = expense.vendor || 'Unknown';
            acc[vendor] = (acc[vendor] || 0) + (Number(expense.amount) || 0);
            return acc;
        }, {});

        const totalEl = document.getElementById('expense-admin-total');
        if (totalEl) totalEl.textContent = formatCurrency(totalSpend);

        const breakdownEl = document.getElementById('expense-admin-breakdown');
        if (breakdownEl) {
            breakdownEl.innerHTML = Object.entries(CATEGORY_LABELS)
                .map(([key, label]) => {
                    return `<div class="expense-breakdown__item"><span>${label}</span><strong>${formatCurrency(categoryTotals[key] || 0)}</strong></div>`;
                })
                .join('');
        }

        const donut = document.getElementById('expense-admin-donut');
        if (donut) {
            const total = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0) || 1;
            let offset = 0;
            const segments = Object.keys(CATEGORY_LABELS).map((key) => {
                const value = categoryTotals[key] || 0;
                const percent = (value / total) * 100;
                const colorVar = getComputedStyle(document.documentElement).getPropertyValue(`--${key}-color`) || '#CBD5F5';
                const segment = `${colorVar.trim()} ${offset}% ${offset + percent}%`;
                offset += percent;
                return segment;
            });
            donut.style.background = `conic-gradient(${segments.join(',')})`;
        }

        const vendorEl = document.getElementById('expense-admin-vendors');
        if (vendorEl) {
            const topVendors = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1]).slice(0, 4);
            vendorEl.innerHTML = topVendors.length
                ? topVendors.map(([vendor, amount]) => `<li>${vendor}<span>${formatCurrency(amount)}</span></li>`).join('')
                : '<li>No vendor data yet.</li>';
        }

        const pendingAmount = state.approved.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
        const pendingEl = document.getElementById('expense-admin-pending');
        if (pendingEl) {
            pendingEl.textContent = `${state.approved.length} pending · ${formatCurrency(pendingAmount)}`;
        }

        const nearLimitEl = document.getElementById('expense-admin-limits');
        if (nearLimitEl) {
            const nearLimit = state.limits.filter((limit) => limit.totalSpentThisMonth >= (limit.monthlyLimit || 0) * 0.8);
            nearLimitEl.innerHTML = nearLimit.length
                ? nearLimit.map((limit) => `<li>${limit.employeeName || limit.id}<span>${formatCurrency(limit.totalSpentThisMonth || 0)}</span></li>`).join('')
                : '<li>No employees near their monthly limit.</li>';
        }
    };

    const ensureModal = () => {
        const modal = document.getElementById('expense-approval-modal');
        if (!modal) return null;
        const close = modal.querySelector('.expense-modal__close');
        close?.addEventListener('click', () => modal.classList.remove('is-open'));
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.classList.remove('is-open');
        });
        return modal;
    };

    const loadLimitWarnings = async (expense) => {
        if (!window.firebaseDb || !window.firestoreFunctions) return;
        const { doc, getDoc } = window.firestoreFunctions;
        const limitRef = doc(window.firebaseDb, 'expenseLimits', expense.employeeId);
        const snapshot = await getDoc(limitRef);
        const data = snapshot.exists() ? snapshot.data() : null;
        const container = document.getElementById('expense-approval-warnings');
        if (!container) return;
        container.innerHTML = '';
        if (!data) return;
        const monthlyLimit = data.monthlyLimit || 0;
        const categoryLimit = data.categoryLimits?.[expense.category] || 0;
        if (monthlyLimit && expense.amount > monthlyLimit) {
            container.innerHTML += `<span class="limit-chip limit-chip--danger">Monthly limit exceeded</span>`;
        } else if (monthlyLimit) {
            container.innerHTML += `<span class="limit-chip limit-chip--warn">Monthly limit ₹${monthlyLimit.toLocaleString()}</span>`;
        }
        if (categoryLimit && expense.amount > categoryLimit) {
            container.innerHTML += `<span class="limit-chip limit-chip--danger">${CATEGORY_LABELS[expense.category]} limit exceeded</span>`;
        } else if (categoryLimit) {
            container.innerHTML += `<span class="limit-chip limit-chip--warn">${CATEGORY_LABELS[expense.category]} limit ₹${categoryLimit.toLocaleString()}</span>`;
        }
    };

    const loadStatsDonut = async (expense) => {
        if (!window.firebaseDb || !window.firestoreFunctions) return;
        const { doc, getDoc } = window.firestoreFunctions;
        const statsRef = doc(window.firebaseDb, 'employeeExpenseStats', expense.employeeId);
        const snapshot = await getDoc(statsRef);
        if (!snapshot.exists()) return;
        const stats = snapshot.data();
        const breakdown = stats.categoryBreakdown || {};
        const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0) || 1;
        let offset = 0;
        const segments = Object.keys(CATEGORY_LABELS).map((key) => {
            const value = breakdown[key] || 0;
            const percent = (value / total) * 100;
            const colorVar = getComputedStyle(document.documentElement).getPropertyValue(`--${key}-color`) || '#CBD5F5';
            const segment = `${colorVar.trim()} ${offset}% ${offset + percent}%`;
            offset += percent;
            return segment;
        });
        const donut = document.getElementById('expense-approval-donut');
        if (donut) donut.style.background = `conic-gradient(${segments.join(',')})`;
    };

    const openModal = async (expense) => {
        const modal = ensureModal();
        if (!modal) return;
        modal.querySelector('[data-modal="employee"]').textContent = expense.employeeName || 'Employee';
        modal.querySelector('[data-modal="vendor"]').textContent = expense.vendor || 'Vendor';
        modal.querySelector('[data-modal="amount"]').textContent = formatCurrency(expense.amount);
        modal.querySelector('[data-modal="category"]').textContent = CATEGORY_LABELS[expense.category] || expense.category;
        modal.querySelector('[data-modal="date"]').textContent = parseDate(expense.date)?.toLocaleDateString() || '—';
        modal.querySelector('[data-modal="receipt"]').src = expense.receiptUrl || '';
        modal.querySelector('[data-modal="receipt-link"]').href = expense.receiptUrl || '#';
        modal.querySelector('[data-modal="receipt-link"]').textContent = expense.receiptUrl || 'No receipt provided.';

        const ai = expense.ocrExtractedData || {};
        modal.querySelector('[data-modal="ai-amount"]').textContent = ai.amount ? formatCurrency(ai.amount) : '—';
        modal.querySelector('[data-modal="ai-vendor"]').textContent = ai.vendor || '—';
        modal.querySelector('[data-modal="ai-category"]').textContent = CATEGORY_LABELS[ai.categoryGuess] || ai.categoryGuess || '—';
        modal.querySelector('[data-modal="ai-confidence"]').textContent = `${Math.round((ai.confidence || 0) * 100)}%`;

        await loadLimitWarnings(expense);
        await loadStatsDonut(expense);

        modal.classList.add('is-open');
        modal.querySelector('[data-modal="approve"]').onclick = () => handleStatusUpdate(expense, 'approved');
        modal.querySelector('[data-modal="reject"]').onclick = () => handleStatusUpdate(expense, 'rejected');
    };

    const handleStatusUpdate = async (expense, status) => {
        if (!window.firebaseDb || !window.firestoreFunctions) return;
        const { doc, updateDoc, serverTimestamp } = window.firestoreFunctions;
        const approverId = window.firebaseState?.user?.uid || 'admin';
        try {
            await updateDoc(doc(window.firebaseDb, 'expenses', expense.id), {
                status,
                approverId,
                approvedAt: serverTimestamp()
            });
            setBanner('');
        } catch (error) {
            console.error('[ExpenseApprovals] Update failed:', error);
            setBanner('Failed to update expense status. Please retry.');
        }
    };

    const attachApprovalHandlers = () => {
        const list = document.getElementById('expense-approvals-list');
        if (!list) return;
        list.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            const id = button.dataset.id;
            const expense = state.pending.find((item) => item.id === id);
            if (!expense) return;

            if (action === 'view') openModal(expense);
            if (action === 'approve') handleStatusUpdate(expense, 'approved');
            if (action === 'reject') handleStatusUpdate(expense, 'rejected');
        });
    };

    const startListeners = () => {
        if (!window.firebaseDb || !window.firestoreFunctions) return;
        const { collection, onSnapshot, query, where, orderBy, doc } = window.firestoreFunctions;

        if (state.pendingUnsub) state.pendingUnsub();
        if (state.approvedUnsub) state.approvedUnsub();
        if (state.allUnsub) state.allUnsub();
        if (state.limitsUnsub) state.limitsUnsub();

        setLoading(true);
        const pendingQuery = query(
            collection(window.firebaseDb, 'expenses'),
            where('status', '==', 'submitted'),
            orderBy('createdAt', 'desc')
        );

        const approvedQuery = query(
            collection(window.firebaseDb, 'expenses'),
            where('status', '==', 'approved'),
            orderBy('createdAt', 'desc')
        );

        const allQuery = query(
            collection(window.firebaseDb, 'expenses'),
            orderBy('createdAt', 'desc')
        );

        state.pendingUnsub = onSnapshot(pendingQuery, debounce((snapshot) => {
            state.pending = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            renderPendingList();
            setLoading(false);
        }, 200));

        state.approvedUnsub = onSnapshot(approvedQuery, debounce((snapshot) => {
            state.approved = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            renderDashboard();
        }, 200));

        state.allUnsub = onSnapshot(allQuery, debounce((snapshot) => {
            state.all = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            renderDashboard();
        }, 200));

        state.limitsUnsub = onSnapshot(collection(window.firebaseDb, 'expenseLimits'), debounce(async (snapshot) => {
            state.limits = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            const statsSnapshot = await Promise.all(
                state.limits.map(async (limit) => {
                    const statsDoc = await window.firestoreFunctions.getDoc(
                        doc(window.firebaseDb, 'employeeExpenseStats', limit.id)
                    );
                    const stats = statsDoc.exists() ? statsDoc.data() : {};
                    return { ...limit, ...stats };
                })
            );
            state.limits = statsSnapshot;
            renderDashboard();
        }, 200));
    };

    const init = () => {
        if (state.initialized) return;
        state.initialized = true;
        attachApprovalHandlers();
        ensureModal();
        startListeners();
    };

    window.initializeExpenseApprovalsUI = init;

    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('expense-approvals')) {
            init();
        }
    });
})(window);
