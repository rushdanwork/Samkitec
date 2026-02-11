const ERM_UI_FILENAME = typeof __filename !== 'undefined' ? __filename : 'expenseRecordUI.js';
console.log('[ERM] File loaded:', ERM_UI_FILENAME);

(function () {
  const state = {
    initialized: false,
    expenses: [],
    listenerActive: false,
  };

  const CATEGORY_OPTIONS = ['Travel', 'Meals', 'Supplies', 'Maintenance', 'Misc'];

  const formatCurrency = (value) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
      Number(value) || 0
    );

  const toYearMonth = (dateValue) =>
    dateValue ? String(dateValue).slice(0, 7) : new Date().toISOString().slice(0, 7);

  const resolveDateString = (expense) => {
    if (!expense) return '';
    if (expense.date) return expense.date;
    const created = expense.createdAt;
    if (created?.toDate) return created.toDate().toISOString().slice(0, 10);
    if (created?.seconds) return new Date(created.seconds * 1000).toISOString().slice(0, 10);
    return '';
  };

  const getService = () => window.expenseRecordService;

  const ensureContainer = () => document.getElementById('expense-record-page');

  const buildLayout = (container) => {
    console.log('[ERM] buildLayout() called');
    try {
      container.innerHTML = `
        <div class="header">
          <h1><i class="fas fa-receipt"></i> Expense Records</h1>
          <div class="user-info">
            <span class="text-muted">Expense Record Management</span>
          </div>
        </div>

        <div class="row" style="gap: 20px;">
          <div class="col-md-6">
            <div class="summary-card">
              <h4 class="summary-title">New Expense</h4>
              <form id="erm-expense-form" class="form">
                <div class="form-group">
                  <label for="erm-date">Date</label>
                  <input type="date" id="erm-date" class="form-control" required />
                </div>
                <div class="form-group">
                  <label for="erm-category">Category</label>
                  <select id="erm-category" class="form-control" required>
                    <option value="">Select category</option>
                    ${CATEGORY_OPTIONS.map(
                      (category) => `<option value="${category}">${category}</option>`
                    ).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="erm-amount">Amount</label>
                  <input type="number" id="erm-amount" class="form-control" min="0" step="0.01" required />
                </div>
                <div class="form-group">
                  <label for="erm-vendor">Vendor</label>
                  <input type="text" id="erm-vendor" class="form-control" placeholder="Vendor name" required />
                </div>
                <div class="form-group">
                  <label for="erm-notes">Notes</label>
                  <textarea id="erm-notes" class="form-control" rows="3" placeholder="Optional notes"></textarea>
                </div>
                <div class="form-group">
                  <label for="erm-receipt">Receipt Upload</label>
                  <input type="file" id="erm-receipt" class="form-control" accept="image/*" />
                  <small id="erm-receipt-status" class="text-muted"></small>
                </div>
                <button type="submit" class="btn btn-primary">Save Expense</button>
                <div id="erm-form-banner" class="text-muted" style="margin-top: 10px;"></div>
              </form>
            </div>
          </div>

          <div class="col-md-6">
            <div class="summary-card">
              <h4 class="summary-title">Monthly Summary</h4>
              <div style="display: grid; gap: 10px;">
                <div>
                  <span class="text-muted">Month</span>
                  <div id="erm-month-label" style="font-weight: 600;"></div>
                </div>
                <div>
                  <span class="text-muted">Total Spend</span>
                  <div id="erm-monthly-total" style="font-size: 1.4rem; font-weight: 700;">
                    ${formatCurrency(0)}
                  </div>
                </div>
                <div>
                  <span class="text-muted">Total Records</span>
                  <div id="erm-monthly-count" style="font-weight: 600;">0</div>
                </div>
              </div>
            </div>

            <div class="summary-card" style="margin-top: 20px;">
              <h4 class="summary-title">Recent Expenses</h4>
              <div class="table-container" style="max-height: 360px; overflow-y: auto;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Vendor</th>
                      <th>Amount</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody id="erm-expense-tbody"></tbody>
                </table>
              </div>
              <div id="erm-empty-state" class="text-muted" style="margin-top: 10px;"></div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('[ERM] Error in buildLayout:', err);
    }
  };

  const renderExpenses = () => {
    console.log('[ERM] renderRecords() called');
    try {
      const tbody = document.getElementById('erm-expense-tbody');
      const emptyState = document.getElementById('erm-empty-state');
      if (!tbody) return;

      if (!state.expenses.length) {
        tbody.innerHTML = '';
        if (emptyState) {
          emptyState.textContent = 'No expenses recorded yet.';
        }
        return;
      }

      if (emptyState) {
        emptyState.textContent = '';
      }

      tbody.innerHTML = '';
      state.expenses.forEach((expense, index) => {
        const row = document.createElement('tr');
        const dateLabel = resolveDateString(expense);
        const receipt = expense.receiptURL
          ? `<a href="${expense.receiptURL}" target="_blank" rel="noreferrer">View</a>`
          : '—';
        const highlightStyle = index < 3 ? 'background-color: rgba(37, 99, 235, 0.08);' : '';
        row.setAttribute('style', highlightStyle);
        row.innerHTML = `
          <td>${dateLabel || '—'}</td>
          <td>${expense.category || '—'}</td>
          <td>${expense.vendor || '—'}</td>
          <td>${formatCurrency(expense.amount)}</td>
          <td>${receipt}</td>
        `;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.error('[ERM] Error in renderRecords:', err);
    }
  };

  const renderSummary = () => {
    console.log('[ERM] renderInsights() called');
    try {
      const monthLabelEl = document.getElementById('erm-month-label');
      const totalEl = document.getElementById('erm-monthly-total');
      const countEl = document.getElementById('erm-monthly-count');
      const now = new Date();
      const currentMonth = toYearMonth(now.toISOString().slice(0, 10));
      const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (monthLabelEl) monthLabelEl.textContent = monthLabel;

      const monthly = state.expenses.filter((expense) => expense.yearMonth === currentMonth);
      const total = monthly.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

      if (totalEl) totalEl.textContent = formatCurrency(total);
      if (countEl) countEl.textContent = `${monthly.length}`;
    } catch (err) {
      console.error('[ERM] Error in renderInsights:', err);
    }
  };

  const syncUI = () => {
    renderExpenses();
    renderSummary();
  };

  const startExpenseListener = () => {
    console.log('[ERM] startRealtimeListener() called');
    try {
      if (state.listenerActive) return;
      const service = getService();
      if (!service || typeof service.listenToExpenses !== 'function') {
        console.error('[ERM] Expense service is not available for realtime updates.');
        return;
      }
      state.listenerActive = true;
      service.listenToExpenses((records) => {
        state.expenses = records.map((record) => ({
          ...record,
          date: resolveDateString(record),
        }));
        syncUI();
      });
    } catch (err) {
      console.error('[ERM] Error in startRealtimeListener:', err);
    }
  };

  const setupForm = () => {
    console.log('[ERM] setupForm() called');
    try {
      const form = document.getElementById('erm-expense-form');
      const receiptInput = document.getElementById('erm-receipt');
      const receiptStatus = document.getElementById('erm-receipt-status');
      const banner = document.getElementById('erm-form-banner');
      const dateInput = document.getElementById('erm-date');
      const categoryInput = document.getElementById('erm-category');
      const amountInput = document.getElementById('erm-amount');
      const vendorInput = document.getElementById('erm-vendor');
      const notesInput = document.getElementById('erm-notes');

      if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (banner) banner.textContent = '';
        if (receiptStatus) receiptStatus.textContent = '';
        const service = getService();
        if (!service) {
          console.error('[ERM] Expense service not available.');
          if (banner) banner.textContent = 'Expense service is unavailable.';
          return;
        }

        try {
          const file = receiptInput?.files?.[0];
          let receiptURL = '';
          if (file) {
            if (receiptStatus) receiptStatus.textContent = 'Uploading receipt...';
            receiptURL = await service.uploadReceipt(file);
            if (receiptStatus) receiptStatus.textContent = 'Receipt uploaded.';
          }

          await service.addExpense({
            date: dateInput?.value,
            amount: amountInput?.value,
            category: categoryInput?.value,
            vendor: vendorInput?.value,
            notes: notesInput?.value,
            receiptURL,
          });

          if (banner) banner.textContent = 'Expense saved successfully.';
          form.reset();
          if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        } catch (err) {
          console.error('[ERM] Error in save expense:', err);
          if (banner) banner.textContent = 'Failed to save expense. Please retry.';
        }
      });
    } catch (err) {
      console.error('[ERM] Error in setupForm:', err);
    }
  };

  const initializeExpenseRecordUI = () => {
    console.log('[ERM] initializeExpenseRecordUI() called');
    try {
      const container = ensureContainer();
      if (!container) return;
      if (!state.initialized) {
        buildLayout(container);
        setupForm();
        state.initialized = true;
      }
      startExpenseListener();
      syncUI();
    } catch (err) {
      console.error('[ERM] Error in initializeExpenseRecordUI:', err);
    }
  };

  const renderExpenseRecordPage = () => {
    console.log('[ERM] renderExpenseRecordPage() called');
    try {
      if (document.readyState === 'loading') {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            renderExpenseRecordPage();
          },
          { once: true }
        );
        return;
      }
      const container = ensureContainer();
      if (!container) {
        console.error('[ERM] Expense record container not found.');
        return;
      }
      container.classList.remove('hidden');
      initializeExpenseRecordUI();
    } catch (err) {
      console.error('[ERM] Error in renderExpenseRecordPage:', err);
    }
  };

  window.renderExpenseRecordPage = renderExpenseRecordPage;
})();
