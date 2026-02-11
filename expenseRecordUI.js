console.log("[ERM] expenseRecordUI.js loaded");

(function () {
  const ERM_STATE = {
    initialized: false,
    expenses: [],
    unsubscribe: null,
    receiptUrl: "",
  };

  const CATEGORY_OPTIONS = ["Meals", "Travel", "Office", "Fuel", "Misc"];

  function getERMService() {
    return window.expenseRecordService;
  }

  function getERMContainer() {
    return document.getElementById("expense-record-page");
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  function resolveExpenseDate(expense) {
    if (!expense) return "";
    if (expense.date) return String(expense.date).slice(0, 10);
    const createdAt = expense.createdAt;
    if (createdAt && typeof createdAt.toDate === "function") {
      return createdAt.toDate().toISOString().slice(0, 10);
    }
    if (createdAt && createdAt.seconds) {
      return new Date(createdAt.seconds * 1000).toISOString().slice(0, 10);
    }
    return "";
  }

  function toMonthKey(dateValue) {
    return dateValue ? String(dateValue).slice(0, 7) : "";
  }

  function normalizeExpenses(records) {
    return (records || []).map(function (record) {
      const date = resolveExpenseDate(record);
      return {
        ...record,
        date: date,
        yearMonth: record.yearMonth || toMonthKey(date),
        amount: Number(record.amount) || 0,
      };
    });
  }

  function showBanner(message, type) {
    const banner = document.getElementById("erm-banner");
    if (!banner) return;
    if (!message) {
      banner.className = "erm-banner";
      banner.textContent = "";
      return;
    }
    banner.textContent = message;
    banner.className = "erm-banner is-visible " + (type === "error" ? "is-error" : "is-success");
  }

  function showUploadStatus(message, type) {
    const uploadStatus = document.getElementById("erm-upload-status");
    if (!uploadStatus) return;
    uploadStatus.textContent = message || "";
    uploadStatus.className = "erm-upload-status" + (message ? " is-visible" : "") + (type ? " is-" + type : "");
  }

  function ensureERMStyles() {
    if (document.getElementById("erm-runtime-styles")) return;
    const style = document.createElement("style");
    style.id = "erm-runtime-styles";
    style.textContent = `
      .erm-page{display:grid;grid-template-columns:minmax(320px,430px) 1fr;gap:20px;align-items:start}
      .erm-panel{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 8px 20px rgba(15,23,42,.06);padding:18px}
      .erm-title{margin:0 0 14px;font-size:1.15rem;color:#0f172a}
      .erm-form{display:grid;gap:12px}
      .erm-form label{display:block;font-weight:600;margin-bottom:6px;font-size:.9rem;color:#334155}
      .erm-form input,.erm-form select,.erm-form textarea{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc}
      .erm-form input:focus,.erm-form select:focus,.erm-form textarea:focus{outline:none;border-color:#60a5fa;box-shadow:0 0 0 4px rgba(59,130,246,.15)}
      .erm-submit{background:#2563eb;color:#fff;border:none;border-radius:10px;padding:11px 14px;font-weight:600;cursor:pointer}
      .erm-submit:hover{background:#1d4ed8}
      .erm-upload-status{display:none;font-size:.82rem;color:#475569}
      .erm-upload-status.is-visible{display:block}
      .erm-upload-status.is-error{color:#b91c1c}
      .erm-upload-status.is-success{color:#047857}
      .erm-banner{display:none;padding:10px 12px;border-radius:10px;font-size:.86rem}
      .erm-banner.is-visible{display:block}
      .erm-banner.is-success{background:rgba(16,185,129,.12);color:#047857}
      .erm-banner.is-error{background:rgba(239,68,68,.12);color:#b91c1c}
      .erm-grid{display:grid;gap:16px}
      .erm-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .erm-metric{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px}
      .erm-metric__label{font-size:.8rem;color:#64748b}
      .erm-metric__value{font-size:1.1rem;font-weight:700;color:#0f172a}
      .erm-charts{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .erm-chart-box{border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#fff}
      .erm-chart-title{font-size:.9rem;font-weight:600;margin-bottom:8px;color:#0f172a}
      .erm-empty{font-size:.85rem;color:#64748b;padding:10px;background:#f8fafc;border-radius:8px;text-align:center}
      .erm-table-wrap{max-height:280px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px}
      .erm-table{width:100%;border-collapse:collapse;background:#fff}
      .erm-table th,.erm-table td{padding:10px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:.86rem}
      .erm-table th{position:sticky;top:0;background:#f8fafc;z-index:1;color:#334155}
      .erm-recent{background:rgba(37,99,235,.08)}
      .erm-modal{position:fixed;inset:0;background:rgba(15,23,42,.6);display:none;align-items:center;justify-content:center;z-index:1000}
      .erm-modal.is-open{display:flex}
      .erm-modal__content{background:#fff;padding:18px;border-radius:12px;width:min(720px,92vw)}
      .erm-modal__header{display:flex;justify-content:space-between;align-items:center}
      .erm-modal__close{background:none;border:none;font-size:1.2rem;cursor:pointer}
      .erm-modal img{width:100%;max-height:70vh;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0;margin-top:10px}
      .erm-chart-bar{fill:#2563eb}
      .erm-chart-label{font-size:10px;fill:#64748b}
      @media (max-width: 1100px){.erm-page{grid-template-columns:1fr}.erm-charts{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function buildERMLayout() {
    console.log("[ERM] buildERMLayout() called");
    try {
      const container = getERMContainer();
      if (!container) {
        console.error("[ERM] expense-record-page container missing");
        return;
      }

      ensureERMStyles();

      container.innerHTML = `
        <div class="header">
          <h1><i class="fas fa-receipt"></i> Expense Records</h1>
          <div class="user-info"><span class="text-muted">Expense Record Management</span></div>
        </div>

        <div class="erm-page">
          <section class="erm-panel">
            <h3 class="erm-title">Add Expense</h3>
            <form id="erm-form" class="erm-form">
              <div>
                <label for="erm-date">Date</label>
                <input id="erm-date" name="date" type="date" required />
              </div>
              <div>
                <label for="erm-category">Category</label>
                <select id="erm-category" name="category" required>
                  <option value="">Select category</option>
                  ${CATEGORY_OPTIONS.map(function (category) {
                    return `<option value="${category}">${category}</option>`;
                  }).join("")}
                </select>
              </div>
              <div>
                <label for="erm-vendor">Vendor</label>
                <input id="erm-vendor" name="vendor" type="text" placeholder="Vendor name" required />
              </div>
              <div>
                <label for="erm-amount">Amount</label>
                <input id="erm-amount" name="amount" type="number" min="0" step="0.01" placeholder="0.00" required />
              </div>
              <div>
                <label for="erm-notes">Notes</label>
                <textarea id="erm-notes" name="notes" rows="3" placeholder="Optional notes"></textarea>
              </div>
              <div>
                <label for="erm-receipt">Receipt upload</label>
                <input id="erm-receipt" name="receipt" type="file" accept="image/*" />
                <div id="erm-upload-status" class="erm-upload-status"></div>
              </div>
              <button class="erm-submit" type="submit">Save Expense</button>
              <div id="erm-banner" class="erm-banner"></div>
            </form>
          </section>

          <section class="erm-panel erm-grid">
            <h3 class="erm-title">Monthly Summary</h3>
            <div class="erm-summary">
              <div class="erm-metric">
                <div class="erm-metric__label">Month</div>
                <div id="erm-summary-month" class="erm-metric__value">-</div>
              </div>
              <div class="erm-metric">
                <div class="erm-metric__label">Total Spend</div>
                <div id="erm-summary-total" class="erm-metric__value">${formatCurrency(0)}</div>
              </div>
              <div class="erm-metric">
                <div class="erm-metric__label">Count</div>
                <div id="erm-summary-count" class="erm-metric__value">0</div>
              </div>
            </div>

            <div class="erm-charts">
              <div class="erm-chart-box">
                <div class="erm-chart-title">Category Pie</div>
                <div id="erm-category-chart"></div>
              </div>
              <div class="erm-chart-box">
                <div class="erm-chart-title">Daily Trend</div>
                <div id="erm-daily-chart"></div>
              </div>
            </div>

            <div>
              <div class="erm-chart-title">Recent Expenses</div>
              <div class="erm-table-wrap">
                <table class="erm-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Vendor</th>
                      <th>Amount</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody id="erm-table-body"></tbody>
                </table>
              </div>
              <div id="erm-empty" class="erm-empty" style="display:none;">No expenses recorded yet.</div>
            </div>
          </section>
        </div>

        <div id="erm-receipt-modal" class="erm-modal" aria-hidden="true">
          <div class="erm-modal__content">
            <div class="erm-modal__header">
              <h3>Receipt Preview</h3>
              <button type="button" class="erm-modal__close" id="erm-receipt-close">&times;</button>
            </div>
            <a id="erm-receipt-link" href="#" target="_blank" rel="noreferrer">Open in new tab</a>
            <img id="erm-receipt-image" src="" alt="Receipt preview" />
          </div>
        </div>
      `;
    } catch (error) {
      console.error("[ERM] Error in buildERMLayout:", error);
    }
  }

  function renderERMTable() {
    console.log("[ERM] renderERMTable() called");
    try {
      const tbody = document.getElementById("erm-table-body");
      const empty = document.getElementById("erm-empty");
      if (!tbody || !empty) return;

      const expenses = ERM_STATE.expenses;
      if (!expenses.length) {
        tbody.innerHTML = "";
        empty.style.display = "block";
        return;
      }

      empty.style.display = "none";
      tbody.innerHTML = "";

      expenses.forEach(function (expense, index) {
        const tr = document.createElement("tr");
        if (index < 3) tr.classList.add("erm-recent");

        const receiptCell = expense.receiptURL
          ? `<button type="button" class="btn btn-outline btn-sm" data-receipt="${expense.receiptURL}">View</button>`
          : "—";

        tr.innerHTML = `
          <td>${expense.date || "—"}</td>
          <td>${expense.category || "—"}</td>
          <td>${expense.vendor || "—"}</td>
          <td>${formatCurrency(expense.amount)}</td>
          <td>${receiptCell}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (error) {
      console.error("[ERM] Error in renderERMTable:", error);
    }
  }

  function renderERMCategoryChart(monthlyExpenses) {
    console.log("[ERM] renderERMCategoryChart() called");
    try {
      const container = document.getElementById("erm-category-chart");
      if (!container) return;

      const totals = monthlyExpenses.reduce(function (acc, item) {
        const key = item.category || "Misc";
        acc[key] = (acc[key] || 0) + (Number(item.amount) || 0);
        return acc;
      }, {});

      const entries = Object.entries(totals);
      if (!entries.length) {
        container.innerHTML = '<div class="erm-empty">No category data for this month.</div>';
        return;
      }

      const grandTotal = entries.reduce(function (sum, pair) {
        return sum + pair[1];
      }, 0);
      const colors = ["#2563eb", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444"];
      let offset = 25;

      const slices = entries
        .map(function (pair, index) {
          const value = pair[1];
          const percentage = (value / grandTotal) * 100;
          const dash = percentage + " " + (100 - percentage);
          const color = colors[index % colors.length];
          const piece = `<circle r="15.915" cx="21" cy="21" fill="transparent" stroke="${color}" stroke-width="8" stroke-dasharray="${dash}" stroke-dashoffset="${offset}"></circle>`;
          offset -= percentage;
          return piece;
        })
        .join("");

      const legend = entries
        .map(function (pair, index) {
          const key = pair[0];
          const value = pair[1];
          const color = colors[index % colors.length];
          return `<div style="display:flex;justify-content:space-between;gap:10px;font-size:.82rem;"><span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:6px;"></span>${key}</span><strong>${formatCurrency(value)}</strong></div>`;
        })
        .join("");

      container.innerHTML = `
        <svg viewBox="0 0 42 42" style="max-width:220px;margin:0 auto 8px;display:block;">
          <circle r="15.915" cx="21" cy="21" fill="transparent" stroke="#e2e8f0" stroke-width="8"></circle>
          ${slices}
        </svg>
        <div style="display:grid;gap:6px;">${legend}</div>
      `;
    } catch (error) {
      console.error("[ERM] Error in renderERMCategoryChart:", error);
    }
  }

  function renderERMDailyChart(monthlyExpenses) {
    console.log("[ERM] renderERMDailyChart() called");
    try {
      const container = document.getElementById("erm-daily-chart");
      if (!container) return;

      const grouped = monthlyExpenses.reduce(function (acc, item) {
        const day = (item.date || "").slice(8, 10) || "--";
        acc[day] = (acc[day] || 0) + (Number(item.amount) || 0);
        return acc;
      }, {});

      const entries = Object.entries(grouped).sort(function (a, b) {
        return a[0].localeCompare(b[0]);
      });

      if (!entries.length) {
        container.innerHTML = '<div class="erm-empty">No daily trend for this month.</div>';
        return;
      }

      const max = Math.max.apply(
        null,
        entries.map(function (item) {
          return item[1];
        })
      );

      const width = 380;
      const height = 180;
      const gap = 8;
      const barWidth = Math.max(10, Math.floor((width - 40) / entries.length) - gap);

      const bars = entries
        .map(function (entry, index) {
          const day = entry[0];
          const amount = entry[1];
          const h = max > 0 ? Math.max(4, Math.round((amount / max) * 120)) : 4;
          const x = 20 + index * (barWidth + gap);
          const y = 145 - h;
          return `
            <rect class="erm-chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4"></rect>
            <text class="erm-chart-label" x="${x + barWidth / 2}" y="162" text-anchor="middle">${day}</text>
          `;
        })
        .join("");

      container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto">${bars}</svg>`;
    } catch (error) {
      console.error("[ERM] Error in renderERMDailyChart:", error);
    }
  }

  function renderERMSummary() {
    console.log("[ERM] renderERMSummary() called");
    try {
      const monthEl = document.getElementById("erm-summary-month");
      const totalEl = document.getElementById("erm-summary-total");
      const countEl = document.getElementById("erm-summary-count");
      if (!monthEl || !totalEl || !countEl) return;

      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const label = now.toLocaleString("default", { month: "long", year: "numeric" });

      const monthlyExpenses = ERM_STATE.expenses.filter(function (item) {
        return (item.yearMonth || toMonthKey(item.date)) === currentMonth;
      });

      const total = monthlyExpenses.reduce(function (sum, item) {
        return sum + (Number(item.amount) || 0);
      }, 0);

      monthEl.textContent = label;
      totalEl.textContent = formatCurrency(total);
      countEl.textContent = String(monthlyExpenses.length);

      renderERMCategoryChart(monthlyExpenses);
      renderERMDailyChart(monthlyExpenses);
    } catch (error) {
      console.error("[ERM] Error in renderERMSummary:", error);
    }
  }

  function setupReceiptModal() {
    console.log("[ERM] setupReceiptModal() called");
    try {
      const modal = document.getElementById("erm-receipt-modal");
      const closeBtn = document.getElementById("erm-receipt-close");
      const image = document.getElementById("erm-receipt-image");
      const link = document.getElementById("erm-receipt-link");
      const tableBody = document.getElementById("erm-table-body");

      if (!modal || !closeBtn || !image || !link || !tableBody) return;

      function closeModal() {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        image.src = "";
        link.href = "#";
      }

      function openModal(url) {
        if (!url) return;
        image.src = url;
        link.href = url;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
      }

      closeBtn.onclick = closeModal;
      modal.addEventListener("click", function (event) {
        if (event.target === modal) closeModal();
      });

      tableBody.addEventListener("click", function (event) {
        const btn = event.target.closest("[data-receipt]");
        if (!btn) return;
        openModal(btn.getAttribute("data-receipt"));
      });
    } catch (error) {
      console.error("[ERM] Error in setupReceiptModal:", error);
    }
  }

  function setupERMForm() {
    console.log("[ERM] setupERMForm() called");
    try {
      const form = document.getElementById("erm-form");
      const dateInput = document.getElementById("erm-date");
      const categoryInput = document.getElementById("erm-category");
      const vendorInput = document.getElementById("erm-vendor");
      const amountInput = document.getElementById("erm-amount");
      const notesInput = document.getElementById("erm-notes");
      const receiptInput = document.getElementById("erm-receipt");

      if (!form || !dateInput || !categoryInput || !vendorInput || !amountInput || !notesInput || !receiptInput) {
        console.error("[ERM] Form elements are missing");
        return;
      }

      dateInput.value = new Date().toISOString().slice(0, 10);

      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        showBanner("", "");

        const service = getERMService();
        if (!service || typeof service.addExpense !== "function" || typeof service.uploadReceipt !== "function") {
          console.error("[ERM] expenseRecordService not ready for add/upload");
          showBanner("Expense service is not ready. Please refresh and try again.", "error");
          return;
        }

        try {
          let receiptURL = "";
          const file = receiptInput.files && receiptInput.files[0];
          if (file) {
            showUploadStatus("Uploading receipt...", "");
            receiptURL = await service.uploadReceipt(file);
            if (receiptURL) {
              ERM_STATE.receiptUrl = receiptURL;
              showUploadStatus("Receipt uploaded successfully.", "success");
            } else {
              showUploadStatus("Receipt upload failed or returned empty URL.", "error");
            }
          } else {
            showUploadStatus("", "");
          }

          const expenseObj = {
            date: dateInput.value,
            yearMonth: toMonthKey(dateInput.value),
            category: categoryInput.value,
            vendor: vendorInput.value.trim(),
            amount: Number(amountInput.value) || 0,
            notes: notesInput.value.trim(),
            receiptURL: receiptURL || "",
          };

          await service.addExpense(expenseObj);
          showBanner("Expense saved successfully.", "success");

          form.reset();
          dateInput.value = new Date().toISOString().slice(0, 10);
          ERM_STATE.receiptUrl = "";
          setTimeout(function () {
            showBanner("", "");
            showUploadStatus("", "");
          }, 2200);
        } catch (error) {
          console.error("[ERM] Failed to save expense:", error);
          showBanner("Failed to save expense. Please retry.", "error");
          showUploadStatus("Upload/save failed.", "error");
        }
      });
    } catch (error) {
      console.error("[ERM] Error in setupERMForm:", error);
    }
  }

  function startERMRealtime() {
    console.log("[ERM] startERMRealtime() called");
    try {
      const service = getERMService();
      if (!service || typeof service.onExpensesChanged !== "function") {
        console.error("[ERM] expenseRecordService.onExpensesChanged is not available");
        return;
      }

      if (typeof ERM_STATE.unsubscribe === "function") {
        return;
      }

      ERM_STATE.unsubscribe = service.onExpensesChanged(
        function (records) {
          ERM_STATE.expenses = normalizeExpenses(records);
          renderERMTable();
          renderERMSummary();
        },
        function (error) {
          console.error("[ERM] Realtime listener error:", error);
        }
      );
    } catch (error) {
      console.error("[ERM] Error in startERMRealtime:", error);
    }
  }

  function renderExpenseRecordPage() {
    console.log("[ERM] renderExpenseRecordPage() called");
    try {
      const container = getERMContainer();
      if (!container) {
        console.error("[ERM] Cannot render ERM: #expense-record-page not found");
        return;
      }

      container.classList.remove("hidden");

      if (!ERM_STATE.initialized) {
        buildERMLayout();
        setupERMForm();
        setupReceiptModal();
        ERM_STATE.initialized = true;
      }

      startERMRealtime();
      renderERMTable();
      renderERMSummary();
    } catch (error) {
      console.error("[ERM] Error in renderExpenseRecordPage:", error);
    }
  }

  window.renderExpenseRecordPage = renderExpenseRecordPage;
})();
