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

    const extractReceiptData = (text) => {
        const amountMatch = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g);
        const amount = amountMatch ? Number(amountMatch[amountMatch.length - 1].replace(/,/g, '')) : null;
        const vendor = text.match(/vendor[:\s-]*([\w\s&.-]{3,})/i)?.[1] || text.split(/[\/._-]/)[0];
        let category = 'misc';
        const lower = text.toLowerCase();
        if (/(flight|hotel|uber|taxi|train)/.test(lower)) category = 'travel';
        if (/(meal|restaurant|cafe|dinner|lunch|breakfast)/.test(lower)) category = 'meals';
        if (/(office|stationery|supplies|software)/.test(lower)) category = 'office';
        if (/(fuel|gas|petrol|diesel)/.test(lower)) category = 'fuel';

        return {
            amount,
            vendor,
            categoryGuess: category,
            confidence: amount || vendor ? 0.78 : 0.55
        };
    };

    const state = {
        expenses: [],
        limits: null,
        stats: null,
        initialized: false,
        unsubscribe: null,
        statsUnsubscribe: null,
        limitsUnsubscribe: null
    };

    const setBanner = (message, type = 'error') => {
        const banner = document.getElementById('expense-error-banner');
        if (!banner) return;
        banner.textContent = message;
        banner.classList.toggle('is-visible', Boolean(message));
        banner.classList.toggle('is-error', type === 'error');
        banner.classList.toggle('is-success', type === 'success');
    };

    const setLoading = (loading) => {
        const loadingEl = document.getElementById('expense-history-loading');
        if (loadingEl) loadingEl.style.display = loading ? 'block' : 'none';
    };

    const updateLimitChips = (amount, category) => {
        const container = document.getElementById('expense-limit-chips');
        if (!container) return;
        container.innerHTML = '';
        if (!state.limits) return;

        const monthlyLimit = state.limits.monthlyLimit || 0;
        const categoryLimit = state.limits.categoryLimits?.[category] || 0;

        if (monthlyLimit && amount > monthlyLimit) {
            const chip = document.createElement('span');
            chip.className = 'limit-chip limit-chip--danger';
            chip.textContent = `Monthly limit exceeded (₹${monthlyLimit.toLocaleString()})`;
            container.appendChild(chip);
        } else if (monthlyLimit) {
            const chip = document.createElement('span');
            chip.className = 'limit-chip limit-chip--warn';
            chip.textContent = `Monthly limit ₹${monthlyLimit.toLocaleString()}`;
            container.appendChild(chip);
        }

        if (categoryLimit && amount > categoryLimit) {
            const chip = document.createElement('span');
            chip.className = 'limit-chip limit-chip--danger';
            chip.textContent = `${CATEGORY_LABELS[category] || category} cap exceeded (₹${categoryLimit.toLocaleString()})`;
            container.appendChild(chip);
        } else if (categoryLimit) {
            const chip = document.createElement('span');
            chip.className = 'limit-chip limit-chip--warn';
            chip.textContent = `${CATEGORY_LABELS[category] || category} cap ₹${categoryLimit.toLocaleString()}`;
            container.appendChild(chip);
        }
    };

    const renderAiPreview = (data) => {
        const container = document.getElementById('expense-ai-preview');
        if (!container) return;
        container.classList.add('is-visible');
        container.querySelector('[data-ai="amount"]').textContent = data.amount ? formatCurrency(data.amount) : '—';
        container.querySelector('[data-ai="vendor"]').textContent = data.vendor || '—';
        container.querySelector('[data-ai="category"]').textContent = CATEGORY_LABELS[data.categoryGuess] || data.categoryGuess || '—';
        container.querySelector('[data-ai="confidence"]').textContent = `${Math.round((data.confidence || 0) * 100)}%`;
    };

    const applyFilters = () => {
        const status = document.getElementById('expense-filter-status')?.value || 'all';
        const category = document.getElementById('expense-filter-category')?.value || 'all';
        const fromDate = document.getElementById('expense-filter-from')?.value;
        const toDate = document.getElementById('expense-filter-to')?.value;

        return state.expenses.filter((expense) => {
            if (status !== 'all' && expense.status !== status) return false;
            if (category !== 'all' && expense.category !== category) return false;
            const expenseDate = parseDate(expense.date || expense.createdAt);
            if (fromDate && expenseDate && expenseDate < new Date(fromDate)) return false;
            if (toDate && expenseDate && expenseDate > new Date(`${toDate}T23:59:59`)) return false;
            return true;
        });
    };

    const renderExpenseTable = () => {
        const body = document.getElementById('expense-history-body');
        if (!body) return;
        body.innerHTML = '';
        const filtered = applyFilters();
        if (filtered.length === 0) {
            body.innerHTML = '<tr><td colspan="6" class="text-muted">No expenses match your filters.</td></tr>';
            return;
        }

        filtered.forEach((expense) => {
            const row = document.createElement('tr');
            const statusClass = STATUS_CLASS[expense.status] || 'status-amber';
            const categoryClass = CATEGORY_CLASS[expense.category] || 'chip-misc';
            row.innerHTML = `
                <td>${expense.vendor || 'Unknown'}</td>
                <td>${formatCurrency(expense.amount)}</td>
                <td><span class="category-chip ${categoryClass}">${CATEGORY_LABELS[expense.category] || expense.category}</span></td>
                <td>${parseDate(expense.date)?.toLocaleDateString() || '—'}</td>
                <td><span class="status-badge ${statusClass}">${expense.status}</span></td>
                <td><button class="btn btn-outline btn-sm" data-receipt="${expense.receiptUrl || ''}">View Receipt</button></td>
            `;
            body.appendChild(row);
        });
    };

    const ensureReceiptModal = () => {
        let modal = document.getElementById('expense-receipt-modal');
        if (!modal) return null;
        const close = modal.querySelector('.expense-modal__close');
        close?.addEventListener('click', () => modal.classList.remove('is-open'));
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.classList.remove('is-open');
        });
        return modal;
    };

    const attachReceiptHandlers = () => {
        const table = document.getElementById('expense-history-body');
        const modal = ensureReceiptModal();
        if (!table || !modal) return;
        table.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-receipt]');
            if (!button) return;
            const receipt = button.dataset.receipt;
            modal.querySelector('.expense-modal__content img').src = receipt || '';
            modal.querySelector('.expense-modal__content .expense-modal__link').textContent = receipt || 'No receipt URL provided.';
            modal.querySelector('.expense-modal__content .expense-modal__link').href = receipt || '#';
            modal.classList.add('is-open');
        });
    };

    const startExpenseListeners = () => {
        if (!window.firebaseDb || !window.firestoreFunctions) return;
        const { collection, onSnapshot, query, where, orderBy, doc } = window.firestoreFunctions;
        const userId = window.firebaseState?.user?.uid || 'guest';

        if (state.unsubscribe) state.unsubscribe();
        if (state.statsUnsubscribe) state.statsUnsubscribe();
        if (state.limitsUnsubscribe) state.limitsUnsubscribe();

        setLoading(true);
        const expenseQuery = query(
            collection(window.firebaseDb, 'expenses'),
            where('employeeId', '==', userId),
            orderBy('createdAt', 'desc')
        );

        state.unsubscribe = onSnapshot(expenseQuery, debounce((snapshot) => {
            state.expenses = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            renderExpenseTable();
            setLoading(false);
        }, 200));

        state.statsUnsubscribe = onSnapshot(
            doc(window.firebaseDb, 'employeeExpenseStats', userId),
            debounce((snapshot) => {
                state.stats = snapshot.exists() ? snapshot.data() : null;
                const totalEl = document.getElementById('expense-total-month');
                if (totalEl) totalEl.textContent = formatCurrency(state.stats?.totalSpentThisMonth || 0);
                const breakdownEl = document.getElementById('expense-category-breakdown');
                if (breakdownEl) {
                    const breakdown = state.stats?.categoryBreakdown || {};
                    breakdownEl.innerHTML = Object.entries(CATEGORY_LABELS)
                        .map(([key, label]) => `<div class="expense-breakdown__item"><span>${label}</span><strong>${formatCurrency(breakdown[key] || 0)}</strong></div>`)
                        .join('');
                }
            }, 200)
        );

        state.limitsUnsubscribe = onSnapshot(
            doc(window.firebaseDb, 'expenseLimits', userId),
            debounce((snapshot) => {
                state.limits = snapshot.exists() ? snapshot.data() : null;
                const limitEl = document.getElementById('expense-limit-value');
                if (limitEl) limitEl.textContent = formatCurrency(state.limits?.monthlyLimit || 0);
            }, 200)
        );
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!window.firebaseDb || !window.firestoreFunctions) return;
        const { addDoc, collection, serverTimestamp } = window.firestoreFunctions;
        const form = event.target;
        const amount = Number(form.amount.value || 0);
        const vendor = form.vendor.value;
        const category = form.category.value;
        const date = form.date.value;
        const receiptUrl = form.receiptUrl.value;
        const userId = window.firebaseState?.user?.uid || 'guest';
        const employeeName = window.firebaseState?.user?.displayName || window.firebaseState?.user?.email || 'Employee';
        const ocrText = form.ocrText?.value || receiptUrl;
        const ocrExtractedData = extractReceiptData(ocrText || '');

        updateLimitChips(amount, category);

        try {
            await addDoc(collection(window.firebaseDb, 'expenses'), {
                employeeId: userId,
                employeeName,
                amount,
                vendor,
                category,
                date,
                status: 'submitted',
                receiptUrl,
                payrollLinked: false,
                payrollRunId: null,
                createdAt: serverTimestamp(),
                approvedAt: null,
                approverId: null,
                ocrExtractedData
            });
            form.reset();
            setBanner('Expense submitted for approval.', 'success');
            setTimeout(() => setBanner(''), 3000);
        } catch (error) {
            console.error('[ExpenseUI] Submit failed:', error);
            setBanner('Failed to submit expense. Please retry.');
        }
    };

    const attachFormHandlers = () => {
        const form = document.getElementById('expense-submit-form');
        if (!form) return;
        if (!form.dataset.bound) {
            form.addEventListener('submit', handleSubmit);
            form.dataset.bound = 'true';
        }

        form.receiptUrl?.addEventListener('input', (event) => {
            const data = extractReceiptData(event.target.value || '');
            renderAiPreview(data);
            if (!form.amount.value && data.amount) form.amount.value = data.amount;
            if (!form.vendor.value && data.vendor) form.vendor.value = data.vendor;
            if (!form.category.value && data.categoryGuess) form.category.value = data.categoryGuess;
            updateLimitChips(Number(form.amount.value || data.amount || 0), form.category.value || data.categoryGuess);
        });

        form.amount?.addEventListener('input', () => {
            updateLimitChips(Number(form.amount.value || 0), form.category.value || 'misc');
        });
        form.category?.addEventListener('change', () => {
            updateLimitChips(Number(form.amount.value || 0), form.category.value || 'misc');
        });
    };

    const attachFilterHandlers = () => {
        ['expense-filter-status', 'expense-filter-category', 'expense-filter-from', 'expense-filter-to']
            .forEach((id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('change', renderExpenseTable);
                }
            });
    };

    const init = () => {
        if (state.initialized) return;
        state.initialized = true;
        const dateInput = document.getElementById('expenseDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
        attachFormHandlers();
        attachFilterHandlers();
        attachReceiptHandlers();
        startExpenseListeners();
    };

    window.initializeExpenseUI = init;

    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('expenses')) {
            init();
        }
    });
})(window);
