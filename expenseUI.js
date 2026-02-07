(function (window) {
    const CATEGORY_LABELS = {
        travel: 'Travel',
        meals: 'Meals',
        office: 'Office',
        misc: 'Misc',
        fuel: 'Fuel',
        software: 'Software',
        utilities: 'Utilities'
    };

    const CATEGORY_COLORS = {
        travel: '#2563eb',
        meals: '#f97316',
        office: '#10b981',
        misc: '#64748b',
        fuel: '#facc15',
        software: '#8b5cf6',
        utilities: '#06b6d4'
    };

    const state = {
        expenses: [],
        initialized: false,
        unsubscribe: null
    };

    const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString()}`;

    const parseDate = (value) => {
        if (!value) return null;
        if (typeof value?.toDate === 'function') return value.toDate();
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const getMonthKey = (value) => {
        const parsed = parseDate(value);
        return parsed ? parsed.toISOString().slice(0, 7) : null;
    };

    const resolveUserRole = () => {
        const user = window.firebaseState?.user;
        const role = user?.role || user?.claims?.role || user?.customClaims?.role;
        if (role) return String(role).toLowerCase();
        const email = (user?.email || '').toLowerCase();
        if (email.includes('accountant')) return 'accountant';
        if (email.includes('admin')) return 'admin';
        return 'admin';
    };

    const canManageExpenses = () => {
        if (typeof window.canManageExpenses === 'function') {
            return window.canManageExpenses();
        }
        const role = resolveUserRole();
        return ['admin', 'accountant'].includes(role);
    };

    const setBanner = (message, type = 'error') => {
        const banner = document.getElementById('expense-entry-banner');
        if (!banner) return;
        banner.textContent = message;
        banner.classList.toggle('is-visible', Boolean(message));
        banner.classList.toggle('is-error', type === 'error');
        banner.classList.toggle('is-success', type === 'success');
    };

    const setUploadStatus = (message, type = 'info') => {
        const status = document.getElementById('expense-upload-status');
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('is-visible', Boolean(message));
        status.dataset.type = type;
    };

    const updateAccessNote = () => {
        const note = document.getElementById('expense-access-note');
        const form = document.getElementById('expense-entry-form');
        const allowed = canManageExpenses();
        if (note) {
            note.textContent = allowed
                ? 'Accountant/Admin access enabled. Capture vendor receipts and keep records audit-ready.'
                : 'Expense creation is restricted to accountant/admin users.';
            note.classList.add('is-visible');
            note.classList.toggle('is-error', !allowed);
            note.classList.toggle('is-success', allowed);
        }
        if (form) {
            form.querySelectorAll('input, select, textarea, button').forEach((element) => {
                if (element.id === 'expenseReceiptUrl') {
                    element.disabled = true;
                    return;
                }
                element.disabled = !allowed;
            });
        }
    };

    const uploadReceipt = async (file) => {
        if (!file) return '';
        const storage = window.firebaseStorage;
        const storageFns = window.storageFunctions;
        if (!storage || !storageFns) {
            return URL.createObjectURL(file);
        }
        const safeName = file.name.replace(/\s+/g, '_');
        const path = `expenses/${Date.now()}_${safeName}`;
        const receiptRef = storageFns.storageRef(storage, path);
        await storageFns.uploadBytes(receiptRef, file);
        return storageFns.getDownloadURL(receiptRef);
    };

    const renderExpenseCards = () => {
        const container = document.getElementById('expense-cards');
        if (!container) return;
        container.innerHTML = '';
        if (!state.expenses.length) {
            container.innerHTML = '<div class="expense-empty">No expenses recorded yet.</div>';
            return;
        }

        state.expenses.forEach((expense) => {
            const card = document.createElement('div');
            card.className = 'expense-card expense-record';
            card.dataset.expenseId = expense.id;
            const category = expense.category || 'misc';
            const categoryLabel = CATEGORY_LABELS[category] || category;
            const amount = formatCurrency(expense.amount);
            const dateLabel = parseDate(expense.date)?.toLocaleDateString() || expense.date || '—';

            card.innerHTML = `
                <button class="expense-card__header expense-card__header--compact" type="button" data-expense-toggle>
                    <div>
                        <h4>${categoryLabel} · ${amount}</h4>
                        <p>${expense.title || 'Untitled expense'}</p>
                    </div>
                    <span class="expense-toggle">View</span>
                </button>
                <div class="expense-card__body">
                    <div class="expense-meta">
                        <span><strong>Vendor:</strong> ${expense.vendor || '—'}</span>
                        <span><strong>Date:</strong> ${dateLabel}</span>
                    </div>
                    <p class="expense-notes">${expense.notes || 'No notes provided.'}</p>
                    <div class="expense-actions">
                        <button class="btn btn-outline btn-sm" data-receipt="${expense.receiptUrl || ''}">View Receipt</button>
                    </div>
                </div>
            `;

            container.appendChild(card);
        });
    };

    const updateMonthlyInsights = () => {
        const nowKey = new Date().toISOString().slice(0, 7);
        const monthExpenses = state.expenses.filter((expense) => {
            const dateKey = getMonthKey(expense.date || expense.createdAt);
            return dateKey === nowKey;
        });

        const total = monthExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
        const categoryTotals = monthExpenses.reduce((acc, expense) => {
            const key = expense.category || 'misc';
            acc[key] = (acc[key] || 0) + (Number(expense.amount) || 0);
            return acc;
        }, {});
        const vendorTotals = monthExpenses.reduce((acc, expense) => {
            const key = expense.vendor || 'Unknown';
            acc[key] = (acc[key] || 0) + (Number(expense.amount) || 0);
            return acc;
        }, {});

        const highestCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
        const highestVendor = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

        const totalEl = document.getElementById('expense-total-month');
        const categoryEl = document.getElementById('expense-top-category');
        const vendorEl = document.getElementById('expense-top-vendor');
        if (totalEl) totalEl.textContent = formatCurrency(total);
        if (categoryEl) categoryEl.textContent = CATEGORY_LABELS[highestCategory] || highestCategory;
        if (vendorEl) vendorEl.textContent = highestVendor;

        renderCategoryChart(categoryTotals, total);
        renderDateChart(monthExpenses);
    };

    const renderCategoryChart = (totals, total) => {
        const container = document.getElementById('expense-category-chart');
        if (!container) return;
        container.innerHTML = '';
        if (!total) {
            container.innerHTML = '<div class="expense-empty">No category data yet.</div>';
            return;
        }

        const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        const size = 160;
        const radius = 70;
        const center = size / 2;
        let cumulative = 0;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.classList.add('expense-chart');

        entries.forEach(([category, value]) => {
            const startAngle = (cumulative / total) * Math.PI * 2;
            cumulative += value;
            const endAngle = (cumulative / total) * Math.PI * 2;

            const x1 = center + radius * Math.cos(startAngle - Math.PI / 2);
            const y1 = center + radius * Math.sin(startAngle - Math.PI / 2);
            const x2 = center + radius * Math.cos(endAngle - Math.PI / 2);
            const y2 = center + radius * Math.sin(endAngle - Math.PI / 2);
            const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute(
                'd',
                `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
            );
            path.setAttribute('fill', CATEGORY_COLORS[category] || '#94a3b8');
            svg.appendChild(path);
        });

        const legend = document.createElement('div');
        legend.className = 'expense-chart-legend';
        legend.innerHTML = entries
            .map(
                ([category, value]) => `
                <div class="expense-chart-legend__item">
                    <span class="dot" style="background:${CATEGORY_COLORS[category] || '#94a3b8'}"></span>
                    <span>${CATEGORY_LABELS[category] || category}</span>
                    <strong>${formatCurrency(value)}</strong>
                </div>`
            )
            .join('');

        container.appendChild(svg);
        container.appendChild(legend);
    };

    const renderDateChart = (expenses) => {
        const container = document.getElementById('expense-date-chart');
        if (!container) return;
        container.innerHTML = '';
        if (!expenses.length) {
            container.innerHTML = '<div class="expense-empty">No date data yet.</div>';
            return;
        }

        const totals = expenses.reduce((acc, expense) => {
            const dateKey = expense.date || parseDate(expense.createdAt)?.toISOString().slice(0, 10) || 'Unknown';
            acc[dateKey] = (acc[dateKey] || 0) + (Number(expense.amount) || 0);
            return acc;
        }, {});

        const entries = Object.entries(totals).sort((a, b) => a[0].localeCompare(b[0]));
        const maxValue = Math.max(...entries.map(([, value]) => value));
        const width = 320;
        const height = 140;
        const padding = 24;
        const barWidth = (width - padding * 2) / entries.length;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.classList.add('expense-chart');

        const linePoints = entries
            .map(([_, value], index) => {
                const x = padding + index * barWidth + barWidth / 2;
                const y = height - padding - (value / maxValue) * (height - padding * 2);
                return `${x},${y}`;
            })
            .join(' ');

        entries.forEach(([dateKey, value], index) => {
            const barHeight = (value / maxValue) * (height - padding * 2);
            const x = padding + index * barWidth + 4;
            const y = height - padding - barHeight;
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', Math.max(barWidth - 8, 6));
            rect.setAttribute('height', barHeight);
            rect.setAttribute('rx', 4);
            rect.setAttribute('fill', '#2563eb');
            svg.appendChild(rect);
        });

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        line.setAttribute('points', linePoints);
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', '#06b6d4');
        line.setAttribute('stroke-width', 2);
        svg.appendChild(line);

        container.appendChild(svg);
    };

    const ensureReceiptModal = () => {
        const modal = document.getElementById('expense-receipt-modal');
        if (!modal) return null;
        const close = modal.querySelector('.expense-modal__close');
        close?.addEventListener('click', () => modal.classList.remove('is-open'));
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.classList.remove('is-open');
        });
        return modal;
    };

    const attachHandlers = () => {
        const form = document.getElementById('expense-entry-form');
        const cards = document.getElementById('expense-cards');
        const receiptInput = document.getElementById('receiptUpload');
        const receiptUrlInput = document.getElementById('expenseReceiptUrl');
        const modal = ensureReceiptModal();

        if (form) {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!window.firebaseDb || !window.firestoreFunctions) {
                    setBanner('Connect Firebase to save expenses.', 'error');
                    return;
                }
                if (!canManageExpenses()) {
                    setBanner('Only accountant/admin users can save expenses.', 'error');
                    return;
                }

                const { addDoc, collection, serverTimestamp } = window.firestoreFunctions;
                const payload = {
                    title: form.expenseTitle.value.trim(),
                    vendor: form.expenseVendor.value.trim(),
                    category: form.expenseCategory.value,
                    amount: Number(form.expenseAmount.value) || 0,
                    date: form.expenseDate.value,
                    notes: form.expenseNotes.value.trim(),
                    receiptUrl: form.dataset.receiptUrl || receiptUrlInput?.value || '',
                    createdAt: serverTimestamp()
                };

                try {
                    setBanner('', 'error');
                    await addDoc(collection(window.firebaseDb, 'expenses'), payload);
                    form.reset();
                    form.dataset.receiptUrl = '';
                    if (receiptUrlInput) receiptUrlInput.value = '';
                    setUploadStatus('', 'info');
                    setBanner('Expense saved successfully.', 'success');
                } catch (error) {
                    console.error('[ExpenseUI] Failed to save expense:', error);
                    setBanner('Failed to save expense. Please retry.', 'error');
                }
            });
        }

        receiptInput?.addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
                setUploadStatus('Uploading receipt...', 'info');
                const hasStorage = Boolean(window.firebaseStorage && window.storageFunctions);
                const url = await uploadReceipt(file);
                if (receiptUrlInput) receiptUrlInput.value = url;
                if (form) form.dataset.receiptUrl = url;
                if (hasStorage) {
                    setUploadStatus('Receipt uploaded successfully.', 'success');
                } else {
                    setUploadStatus('Storage not configured. Using local preview URL only.', 'error');
                }
            } catch (error) {
                console.error('[ExpenseUI] Receipt upload failed:', error);
                setUploadStatus('Receipt upload failed. Use a public URL instead.', 'error');
            }
        });

        cards?.addEventListener('click', (event) => {
            const toggle = event.target.closest('[data-expense-toggle]');
            if (toggle) {
                toggle.parentElement.classList.toggle('is-open');
                return;
            }
            const receiptButton = event.target.closest('button[data-receipt]');
            if (receiptButton && modal) {
                const receipt = receiptButton.dataset.receipt;
                modal.querySelector('img').src = receipt || '';
                modal.querySelector('.expense-modal__link').textContent = receipt || 'No receipt URL provided.';
                modal.querySelector('.expense-modal__link').href = receipt || '#';
                modal.classList.add('is-open');
            }
        });
    };

    const startExpenseListener = () => {
        if (!window.firebaseDb || !window.firestoreFunctions) return;
        const { collection, onSnapshot, orderBy, query } = window.firestoreFunctions;
        if (state.unsubscribe) state.unsubscribe();
        const expenseQuery = query(collection(window.firebaseDb, 'expenses'), orderBy('createdAt', 'desc'));
        state.unsubscribe = onSnapshot(expenseQuery, (snapshot) => {
            state.expenses = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            renderExpenseCards();
            updateMonthlyInsights();
        });
    };

    window.initializeExpenseUI = () => {
        updateAccessNote();
        if (!state.initialized) {
            attachHandlers();
            state.initialized = true;
        }
        startExpenseListener();
    };
})(window);
