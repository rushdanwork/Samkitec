# Compliance Risk Engine Audit & Validation Guide

## Scan Triggers

Compliance scans are triggered in three ways:

1. **Realtime data triggers** from Firestore listeners in `complianceRiskEngine.js`:
   - `employees`
   - `attendanceRecords`
   - `payrollRecords`
   - `stateRules`
2. **Manual trigger** via UI button (`Run Compliance Scan`) calling `window.runComplianceScan('manual')`.
3. **Immediate post-payroll trigger** when payroll is saved in `payrollProcessing.js`:
   - dispatches `payrollRunCompleted`
   - invokes `window.runComplianceScan('payrollRunCompleted')`

## Active Rules and Alert Conditions

### PF Rules
- PF Eligibility: basic + DA <= 15,000 and PF not enabled
- PF Wage Mismatch: PF wage != basic + DA
- EPF Contribution Mismatch: employee EPF != 12% PF wage
- EPS Cap Violation: EPS exceeds cap logic
- Employer PF Split Mismatch: employer EPF + EPS != 12% PF wage

### ESI Rules
- ESI Eligibility: gross <= 21,000 but ESI not enabled
- Employee ESI mismatch: != 0.75% gross
- Employer ESI mismatch: != 3.25% gross
- Missing challan details or delayed monthly deposit checks

### PT Rules
- Invalid state slab with deduction present
- Missing PT where slab applies
- Slab mismatch deduction
- Duplicate PT deduction pattern

### TDS Rules
- PAN missing with TDS below 20%
- Regime mismatch (employee vs payroll)
- TDS expected vs actual mismatch
- Declaration/proof mismatch

### Payroll/Salary Anomaly Rules
- Salary spike above 40% vs recent average
- Deduction drop below 50% vs recent average

### Attendance and Attendance-Gap Rules
- Device cloning pattern (>=3 devices)
- Timestamp reuse pattern
- Impossible travel check-ins
- Sudden perfect attendance pattern
- Daily overtime > 2 hrs
- Monthly overtime > 50 hrs

## Firestore Dependencies

### Reads
- `employees`
- `attendanceRecords`
- `payrollRecords`
- `stateRules`

### Writes
- `complianceViolations/{employeeId}`
  - `summary.employeeId`
  - `summary.employeeName`
  - `summary.riskScore`
  - `summary.riskLevel`
  - `summary.lastEvaluated` (server timestamp)
  - `summary.lastEvaluatedIso` (ISO timestamp string)
  - `summary.violationCount`
  - `topViolations` (max 8 entries)
- `complianceViolations/{employeeId}/violations/list`
  - `list` (normalized violations with `triggeredAt` ISO string)
  - `updatedAt` (server timestamp)
  - `updatedAtIso` (ISO timestamp string)

## Validation and Test Harness

Use `window.runComplianceScanTest()`:

```js
window.runComplianceScanTest({
  payrollRunId: 'run-2026-01',
  expectedByEmployee: [
    { employeeId: 'EMP001', expectedViolationTypes: ['PF Eligibility', 'PT Missing'] },
    { employeeId: 'EMP002', expectedViolationTypes: [] },
  ],
  reason: 'qa-regression'
});
```

The function:
- runs a scan,
- compares actual violation types to expectations,
- reports mismatches (missing/extra rules),
- logs pass/fail summary in console.

## Audit Findings Summary

- UI now reads real violation payloads from `topViolations` and fallback detail fetches.
- Demo-like empty card behavior (due to missing `report.violations`) is removed.
- Severity and message normalization prevents blank/hardcoded-placeholder output.
- Scan lifecycle logging now includes start/end, per-employee raw data, and per-rule trigger logs.
- Firestore writes now use `Promise.allSettled` with explicit per-target error logging.
- Timestamps inside arrays are ISO strings; server timestamps remain top-level fields only.

## Manual Run Instructions

1. Ensure Firebase is initialized and data is present.
2. Trigger payroll save or click **Run Compliance Scan** in UI.
3. Observe console logs for:
   - scan start/end
   - employee payload snapshots
   - triggered rules
4. Open the compliance modal to verify details are rendered from stored violations.
5. Run `window.runComplianceScanTest(...)` for expectation-based validation.
