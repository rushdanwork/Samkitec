console.log("[ERM] expenseRecordUI.js executing...");

const CATEGORY_OPTIONS = ["Meals", "Travel", "Office", "Fuel", "Misc"];

const ERM_STATE = {
  initialized: false,
  expenses: [],
  unsubscribe: null,
  receiptUrl: "",
};

function getExpenseService() {
  return window.expenseRecordService || null;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(value) || 0);
}

function resolveDateString(expense) {
  if (!expense) return "—";
  if (expense.date) return String(expense.date);
  if (expense.createdAt && typeof expense.createdAt.toDate === "function") {
    return expense.createdAt.toDate().toISOString().slice(0, 10);
  }
  if (expense.createdAt && expense.createdAt.seconds) {
    return new Date(expense.createdAt.seconds * 1000).toISOString().slice(0, 10);
  }
  return "—";
}

function ensureExpenseRecordContainer() {
  return document.getElementById("expense-record-page");
}

function setFormBanner(message, type) {
  const banner = document.getElementById("erm-form-banner");
  if (!banner) return;
  banner.textContent = message || "";
  banner.className = type ? `erm-banner ${type}` : "erm-banner";
}

function setReceiptUploadStatus(message) {
  const status = document.getElementById("erm-receipt-status");
  if (!status) return;
  status.textContent = message || "";
}

function buildExpenseRecordLayout(container) {
  container.innerHTML = `
    <div class="summary-card">
      <h3>Expense Records</h3>
      <form id="erm-expense-form" class="form" style="display:grid;gap:10px;margin-bottom:16px;">
        <input id="erm-date" type="date" class="form-control" required />
        <select id="erm-category" class="form-control" required>
          <option value="">Select category</option>
          ${CATEGORY_OPTIONS.map((c) => `<option value="${c}">${c}</option>`).join("")}
        </select>
        <input id="erm-amount" type="number" min="0" step="0.01" class="form-control" placeholder="Amount" required />
        <input id="erm-vendor" type="text" class="form-control" placeholder="Vendor" required />
        <textarea id="erm-notes" class="form-control" rows="2" placeholder="Notes (optional)"></textarea>
        <input id="erm-receipt" type="file" class="form-control" accept="image/*" />
        <small id="erm-receipt-status" class="text-muted"></small>
        <button type="submit" class="btn btn-primary">Save Expense</button>
        <div id="erm-form-banner" class="text-muted"></div>
      </form>

      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;">
        <strong>Total:</strong>
        <span id="erm-monthly-total">${formatCurrency(0)}</span>
      </div>

      <div class="table-container">
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
        <div id="erm-empty-state" class="text-muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
}

function normalizeExpenseRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.map(function (item) {
    return {
      ...item,
      amount: Number(item && item.amount) || 0,
    };
  });
}

function renderExpenseRows() {
  const tbody = document.getElementById("erm-expense-tbody");
  const empty = document.getElementById("erm-empty-state");
  const totalEl = document.getElementById("erm-monthly-total");
  if (!tbody) return;

  if (!ERM_STATE.expenses.length) {
    tbody.innerHTML = "";
    if (empty) empty.textContent = "No expenses recorded yet.";
    if (totalEl) totalEl.textContent = formatCurrency(0);
    return;
  }

  if (empty) empty.textContent = "";
  const total = ERM_STATE.expenses.reduce(function (sum, e) {
    return sum + (Number(e.amount) || 0);
  }, 0);
  if (totalEl) totalEl.textContent = formatCurrency(total);

  tbody.innerHTML = ERM_STATE.expenses
    .map(function (expense) {
      const receiptUrl = expense.receiptUrl || expense.receiptURL || "";
      const receiptCell = receiptUrl
        ? `<a href="${receiptUrl}" target="_blank" rel="noreferrer">View</a>`
        : "—";
      return `
        <tr>
          <td>${resolveDateString(expense)}</td>
          <td>${expense.category || "—"}</td>
          <td>${expense.vendor || "—"}</td>
          <td>${formatCurrency(expense.amount)}</td>
          <td>${receiptCell}</td>
        </tr>
      `;
    })
    .join("");
}

function startExpenseRecordListener() {
  const service = getExpenseService();
  if (!service || typeof service.onExpensesChanged !== "function") return;
  if (ERM_STATE.unsubscribe) return;

  ERM_STATE.unsubscribe = service.onExpensesChanged(
    function (records) {
      ERM_STATE.expenses = normalizeExpenseRecords(records);
      renderExpenseRows();
    },
    function (error) {
      console.error("[ERM] Expense listener failed:", error);
    }
  );
}

function setupExpenseForm() {
  const form = document.getElementById("erm-expense-form");
  const dateInput = document.getElementById("erm-date");
  const categoryInput = document.getElementById("erm-category");
  const amountInput = document.getElementById("erm-amount");
  const vendorInput = document.getElementById("erm-vendor");
  const notesInput = document.getElementById("erm-notes");
  const receiptInput = document.getElementById("erm-receipt");

  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

  if (receiptInput) {
    receiptInput.addEventListener("change", async function (event) {
      const file = event.target && event.target.files ? event.target.files[0] : null;
      if (!file) {
        ERM_STATE.receiptUrl = "";
        setReceiptUploadStatus("");
        return;
      }

      if (!file.type || !file.type.startsWith("image/")) {
        setReceiptUploadStatus("Please upload an image file.");
        receiptInput.value = "";
        return;
      }

      const service = getExpenseService();
      if (!service || typeof service.uploadReceipt !== "function") {
        setReceiptUploadStatus("Receipt upload is unavailable.");
        return;
      }

      setReceiptUploadStatus("Uploading receipt...");
      try {
        const url = await service.uploadReceipt(file);
        ERM_STATE.receiptUrl = url || "";
        setReceiptUploadStatus("Receipt uploaded.");
      } catch (error) {
        console.error("[ERM] Receipt upload failed:", error);
        ERM_STATE.receiptUrl = "";
        setReceiptUploadStatus("Receipt upload failed.");
      }
    });
  }

  if (!form) return;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setFormBanner("", "");

    const service = getExpenseService();
    if (!service || typeof service.addExpense !== "function") {
      setFormBanner("Expense service is unavailable.", "error");
      return;
    }

    try {
      await service.addExpense({
        date: dateInput ? dateInput.value : "",
        category: categoryInput ? categoryInput.value : "",
        amount: amountInput ? amountInput.value : 0,
        vendor: vendorInput ? vendorInput.value.trim() : "",
        notes: notesInput ? notesInput.value.trim() : "",
        receiptUrl: ERM_STATE.receiptUrl || "",
      });

      form.reset();
      ERM_STATE.receiptUrl = "";
      if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
      setReceiptUploadStatus("");
      setFormBanner("Expense saved successfully.", "success");
    } catch (error) {
      console.error("[ERM] Failed to save expense:", error);
      setFormBanner("Failed to save expense. Please retry.", "error");
    }
  });
}

function initializeExpenseRecordUI() {
  console.log("[ERM] initializeExpenseRecordUI() called");
  const container = ensureExpenseRecordContainer();
  if (!container) {
    console.error("[ERM] #expense-record-page not found.");
    return;
  }

  if (!ERM_STATE.initialized) {
    buildExpenseRecordLayout(container);
    setupExpenseForm();
    ERM_STATE.initialized = true;
  }

  startExpenseRecordListener();
  renderExpenseRows();
}

function renderExpenseRecordPage() {
    console.log("[ERM] renderExpenseRecordPage invoked");
    initializeExpenseRecordUI();
}

window.initializeExpenseRecordUI = initializeExpenseRecordUI;
window.renderExpenseRecordPage = renderExpenseRecordPage;

// ----------------------------------------------------
// FINAL GLOBAL EXPORT (do NOT remove or rename)
// ----------------------------------------------------
if (typeof renderExpenseRecordPage === "function") {
    window.renderExpenseRecordPage = renderExpenseRecordPage;
    console.log("[ERM] Global export OK: renderExpenseRecordPage registered.");
} else {
    console.error("[ERM] renderExpenseRecordPage is missing or undefined.");
}
