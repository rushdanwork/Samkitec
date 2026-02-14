# Payroll-Run Linked Compliance Engine (Option B)

## What changed

The compliance engine is now **run-linked** and produces **rule-by-rule output for every employee for a specific payroll run**.

When payroll is saved:
1. `payrollProcessing.savePayroll()` dispatches `payrollRunCompleted` with `runId`.
2. It calls `window.runComplianceScan(runId)`.
3. The engine fetches payroll/employees/attendance/state rules.
4. It evaluates PF, ESI, TDS, PT, minimum wage, attendance, and salary anomaly.
5. It writes employee summary + rules into Firestore under the run.

---

## Firestore structure

### New run-linked storage

- `complianceResults/{runId}/{employeeId}/summary`
- `complianceResults/{runId}/{employeeId}/rules`

Each `summary` doc contains:
- `riskScore` (0-100)
- `severity` (`low | medium | high`)
- `violationCount`
- `timestamp`
- `employeeId`
- `employeeName`

Each `rules` doc contains:
- `pf`
- `esi`
- `tds`
- `pt`
- `minWage`
- `attendance`
- `salaryAnomaly`

Each rule object shape:
```json
{
  "passed": true,
  "severity": "low",
  "reason": "Rule passed without violations.",
  "expected": "No violations expected.",
  "actual": []
}
```

### Scan metadata doc

For UI listing support:
- `complianceResults/{runId}/_meta/scanInfo`
  - `employeeIds`
  - `completedAt`
  - `completedAtTs`

### Backward compatibility

Legacy writes are still produced for existing pages/widgets:
- `complianceViolations/{employeeId}`
- `complianceViolations/{employeeId}/violations/list`

---

## Trigger behavior

### Automatic trigger after payroll save

`payrollProcessing.js` now:
- dispatches event with both `runId` and `payrollRunId`
- invokes `window.runComplianceScan(payrollRunId)`

### Manual trigger

UI button still works and runs scan for the currently selected payroll run.

---

## UI usage

In Compliance Risk Manager:
1. Select a payroll run from the new **Payroll Run** dropdown.
2. View summary chips (high/medium/low + avg score).
3. Review employee list with severity + violation count.
4. Click **Expand** to see detailed PF/ESI/TDS/PT/minWage/attendance/salaryAnomaly rule output.

---

## Logging

The engine logs:
- scan start / end
- per-employee summary + rule payload
- Firestore write failures with runId/employeeId context

---

## Browser console helpers

```js
// Scan latest run
window.runComplianceScan('manual')

// Scan a specific run
window.runComplianceScan('YOUR_RUN_ID')

// Lightweight test helper
window.runComplianceScanTest({
  runId: 'YOUR_RUN_ID',
  expectedByEmployee: [
    { employeeId: 'EMP001', maxRiskScore: 80 }
  ]
})
```
