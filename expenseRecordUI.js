console.log('[ERM] expenseRecordUI.js loaded');

import {
  addExpense,
  groupByCategory,
  groupByDate,
  onExpensesChanged,
  uploadReceipt,
} from './backend/expenseRecordService.js';

const CATEGORY_OPTIONS = ['Meals', 'Travel', 'Office', 'Fuel', 'Misc'];

const state = {
  initialized: false,
  expenses: [],
  unsubscribe: null,
  receiptUrl: '',
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    Number(value) || 0
  );

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

const buildLayout = (container) => {
  console.log('[ERM] buildLayout() called');
  try {
    container.innerHTML = `
      <div class="header">
      <h1><i class="fas fa-receipt"></i> Expense Records</h1>
      <div class="user-info">
        <span class="erm-badge">Accountant/Admin</span>
        <button onclick="logout()" class="btn btn-danger" style="margin-left: 10px; padding: 5px 10px;">
          <i class="fas fa-sign-out-alt"></i> Logout
        </button>
      </div>
    </div>

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
          <div>
            <h4>Daily Trend</h4>
            <div id="erm-date-chart"></div>
          </div>
          <div class="erm-metrics">
            <div>Total monthly spend: <strong id="erm-total-month">₹0</strong></div>
            <div>Highest category: <strong id="erm-top-category">—</strong></div>
            <div>Highest vendor: <strong id="erm-top-vendor">—</strong></div>
          </div>
        </div>
      </div>

      <div class="erm-card">
        <div class="erm-card__header">
          <h3>Expense Records</h3>
          <span class="text-muted">Real-time ledger</span>
        </div>
        <div id="erm-records" class="erm-grid"></div>
      </div>
    </div>

    <div id="erm-receipt-modal" class="erm-modal" aria-hidden="true">
      <div class="erm-modal__content">
        <div class="erm-card__header">
          <h3>Receipt Preview</h3>
          <button class="erm-modal__close" type="button">&times;</button>
        </div>
        <a class="erm-modal__link" href="#" target="_blank" rel="noreferrer">No receipt URL provided.</a>
        <img src="" alt="Expense receipt preview">
      </div>
      </div>
    `;
  } catch (err) {
    console.error('[ERM] Error in buildLayout:', err);
  }
};

const setBanner = (element, message, type) => {
  if (!element) return;
  if (!message) {
    element.className = 'erm-banner';
    element.textContent = '';
    return;
  }
  element.textContent = message;
  element.className = `erm-banner is-visible ${type ? `is-${type}` : ''}`.trim();
};

const setUploadStatus = (element, message) => {
  if (!element) return;
  if (!message) {
    element.textContent = '';
    element.classList.remove('is-visible');
    return;
  }
  element.textContent = message;
  element.classList.add('is-visible');
};

const renderRecords = (expenses) => {
  console.log('[ERM] renderRecords() called');
  try {
    const container = document.getElementById('erm-records');
    if (!container) return;
    if (!expenses.length) {
      container.innerHTML = '<div class="erm-empty">No expenses recorded yet.</div>';
      return;
    }

    container.innerHTML = '';
    expenses.forEach((expense) => {
      const record = document.createElement('div');
      record.className = 'erm-record';
      record.dataset.expenseId = expense.id;
      const categoryLabel = (expense.category || 'misc').toUpperCase();
      record.innerHTML = `
        <div class="erm-record__header">
          <div>
            <div><strong>${categoryLabel}</strong></div>
            <div>${formatCurrency(expense.amount)}</div>
          </div>
          <button class="erm-record__toggle" type="button" data-toggle>View</button>
        </div>
        <div class="erm-record__details">
          <div><strong>Vendor:</strong> ${expense.vendor || '—'}</div>
          <div><strong>Date:</strong> ${expense.date || '—'}</div>
          <div><strong>Notes:</strong> ${expense.notes || 'No notes provided.'}</div>
          <button class="btn btn-outline btn-sm" type="button" data-receipt="${expense.receiptUrl || ''}">
            View Receipt
          </button>
        </div>
      `;
      container.appendChild(record);
    });
  } catch (err) {
    console.error('[ERM] Error in renderRecords:', err);
  }
};

const renderCategoryChart = (totals) => {
  const container = document.getElementById('erm-category-chart');
  if (!container) return;
  const entries = Object.entries(totals);
  if (!entries.length) {
    container.innerHTML = '<div class="erm-empty">No category data yet.</div>';
    return;
  }

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const colors = ['#2563EB', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444'];
  let offset = 25;

  const slices = entries
    .map(([label, value], index) => {
      const percentage = (value / total) * 100;
      const dash = `${percentage} ${100 - percentage}`;
      const stroke = colors[index % colors.length];
      const slice = `<circle r="15.915" cx="21" cy="21" fill="transparent" stroke="${stroke}"
        stroke-width="8" stroke-dasharray="${dash}" stroke-dashoffset="${offset}"></circle>`;
      offset -= percentage;
      return slice;
    })
    .join('');

  const legend = entries
    .map(
      ([label, value], index) => `
      <div class="erm-chart-legend__item">
        <span><span class="dot" style="background:${colors[index % colors.length]}"></span>${label}</span>
        <span>${formatCurrency(value)}</span>
      </div>`
    )
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 42 42" class="erm-chart" aria-label="Expense categories pie chart">
      <circle r="15.915" cx="21" cy="21" fill="transparent" stroke="#E2E8F0" stroke-width="8"></circle>
      ${slices}
    </svg>
    <div class="erm-chart-legend">${legend}</div>
  `;
};

const renderDateChart = (totals) => {
  const container = document.getElementById('erm-date-chart');
  if (!container) return;
  const entries = Object.entries(totals).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) {
    container.innerHTML = '<div class="erm-empty">No date data yet.</div>';
    return;
  }

  const maxValue = Math.max(...entries.map(([, value]) => value));
  const width = 600;
  const height = 200;
  const padding = 30;
  const barWidth = Math.max(18, (width - padding * 2) / entries.length - 10);

  const bars = entries
    .map(([date, value], index) => {
      const barHeight = (value / maxValue) * (height - padding * 2);
      const x = padding + index * (barWidth + 10);
      const y = height - padding - barHeight;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="#2563EB"></rect>
        <text x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#64748B">
          ${date.slice(8)}
        </text>
      `;
    })
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="erm-chart" aria-label="Expense trend chart">
      ${bars}
    </svg>
  `;
};

const renderInsights = (expenses) => {
  console.log('[ERM] renderInsights() called');
  try {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    const monthLabelEl = document.getElementById('erm-month-label');
    if (monthLabelEl) monthLabelEl.textContent = monthLabel;

    const monthExpenses = expenses.filter((expense) => toMonthKey(expense.date) === monthKey);
    const total = monthExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const categoryTotals = groupByCategory(monthExpenses);
    const vendorTotals = groupByVendor(monthExpenses);
    const dateTotals = groupByDate(monthExpenses);

    const totalEl = document.getElementById('erm-total-month');
    const categoryEl = document.getElementById('erm-top-category');
    const vendorEl = document.getElementById('erm-top-vendor');

    if (totalEl) totalEl.textContent = formatCurrency(total);
    if (categoryEl) categoryEl.textContent = findTopKey(categoryTotals);
    if (vendorEl) vendorEl.textContent = findTopKey(vendorTotals);

    renderCategoryChart(categoryTotals);
    renderDateChart(dateTotals);
  } catch (err) {
    console.error('[ERM] Error in renderInsights:', err);
  }
};

const setupReceiptModal = () => {
  const modal = document.getElementById('erm-receipt-modal');
  if (!modal) return;
  const closeButton = modal.querySelector('.erm-modal__close');
  const link = modal.querySelector('.erm-modal__link');
  const image = modal.querySelector('img');

  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    if (image) image.src = '';
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

const setupForm = () => {
  console.log('[ERM] setupForm() called');
  try {
    const form = document.getElementById('erm-expense-form');
    const banner = document.getElementById('erm-entry-banner');
    const accessNote = document.getElementById('erm-access-note');
    const uploadInput = document.getElementById('ermReceiptUpload');
    const uploadStatus = document.getElementById('erm-upload-status');
    const receiptUrlInput = document.getElementById('ermReceiptUrl');

    const canManage = typeof window.canManageExpenses === 'function' && window.canManageExpenses();
    if (!canManage) {
      setBanner(accessNote, 'Only accountant/admin users can access Expense Records.', 'error');
    } else {
      setBanner(accessNote, '', '');
    }

    uploadInput?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        state.receiptUrl = '';
        if (receiptUrlInput) receiptUrlInput.value = '';
        setUploadStatus(uploadStatus, '');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setUploadStatus(uploadStatus, 'Please upload an image file.');
        uploadInput.value = '';
        return;
      }
      setUploadStatus(uploadStatus, 'Uploading receipt image...');
      try {
        const url = await uploadReceipt(file);
        state.receiptUrl = url;
        if (receiptUrlInput) receiptUrlInput.value = url;
        setUploadStatus(uploadStatus, 'Receipt uploaded.');
      } catch (error) {
        console.error('[ERM] Receipt upload failed:', error);
        setUploadStatus(uploadStatus, 'Receipt upload failed.');
      }
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!canManage) {
        setBanner(banner, 'Only accountant/admin users can save expenses.', 'error');
        return;
      }
      try {
        await addExpense({
          title: form.ermTitle.value.trim(),
          vendor: form.ermVendor.value.trim(),
          category: form.ermCategory.value,
          amount: form.ermAmount.value,
          date: form.ermDate.value,
          notes: form.ermNotes.value.trim(),
          receiptUrl: state.receiptUrl || '',
        });
        form.reset();
        state.receiptUrl = '';
        if (receiptUrlInput) receiptUrlInput.value = '';
        if (uploadInput) uploadInput.value = '';
        setUploadStatus(uploadStatus, '');
        setBanner(banner, 'Expense saved successfully.', 'success');
        setTimeout(() => setBanner(banner, '', ''), 2400);
      } catch (error) {
        console.error('[ERM] Failed to save expense:', error);
        setBanner(banner, 'Failed to save expense. Please retry.', 'error');
      }
    });

    const dateInput = document.getElementById('ermDate');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  } catch (err) {
    console.error('[ERM] Error in setupForm:', err);
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

const startRealtimeListener = () => {
  console.log('[ERM] startRealtimeListener() called');
  try {
    if (state.unsubscribe) return;
    state.unsubscribe = onExpensesChanged(
      (records) => {
        state.expenses = normalizeExpenses(records);
        renderRecords(state.expenses);
        renderInsights(state.expenses);
      },
      (error) => {
        console.error('[ERM] Expense listener failed:', error);
      }
    );
  } catch (err) {
    console.error('[ERM] Error in startRealtimeListener:', err);
  }
};

export const initializeExpenseRecordUI = () => {
  console.log('[ERM] initializeExpenseRecordUI() called');
  try {
    const container = document.getElementById('expense-record-page');
    if (!container) return;

    if (!state.initialized) {
      buildLayout(container);
      setupForm();
      const openModal = setupReceiptModal();
      setupRecordInteractions(openModal);
      state.initialized = true;
    }

    startRealtimeListener();
    renderRecords(state.expenses);
    renderInsights(state.expenses);
  } catch (err) {
    console.error('[ERM] Error in initializeExpenseRecordUI:', err);
  }
};

window.initializeExpenseRecordUI = initializeExpenseRecordUI;

export const renderExpenseRecordPage = () => {
  console.log('[ERM] renderExpenseRecordPage invoked.');
  if (document.readyState === 'loading') {
    console.log('[ERM] DOM not ready. Deferring ERM initialization.');
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        console.log('[ERM] DOM ready. Running deferred ERM initialization.');
        renderExpenseRecordPage();
      },
      { once: true }
    );
    return;
  }
  const canManage = typeof window.canManageExpenses === 'function' && window.canManageExpenses();
  if (!canManage) {
    console.warn('[ERM] Expense record access denied.');
    return;
  }
  const container = document.getElementById('expense-record-page');
  if (!container) {
    console.warn('[ERM] Expense record container not found.');
    return;
  }
};

  window.renderExpenseRecordPage = renderExpenseRecordPage;
})();
