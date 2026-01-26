# Firestore Schema

## Collections

### `employees/{employeeId}`
- `employeeId` (string)
- `name` (string)
- `department` (string)
- `position` (string)
- `status` (string: active | inactive)
- `pfApplicable` (boolean)
- `esiApplicable` (boolean)
- `pfNumber` (string)
- `state` (string)
- `createdAt` (timestamp)

### `attendanceRecords/{date}`
- `records` (map)
  - `{employeeId}`
    - `status` (string: present | leave | late | halfday | absent)
    - `timestamp` (timestamp)

### `payrollRecords/{recordId}`
- `employeeId` (string)
- `period` (string, `YYYY-MM`)
- `gross` (number)
- `basic` (number)
- `netSalary` (number)
- `pf` (number)
- `esi` (number)
- `tds` (number)
- `pt` (number)
- `paymentDate` (timestamp)

### `notifications/{notificationId}`
- `type` (string)
- `message` (string)
- `riskLevel` (string: low | medium | high)
- `timestamp` (timestamp)

### `complianceScans/{month}`
- `score` (number)
- `scannedAt` (timestamp)
- `risks` (array of risk objects)

### `complianceRisks/{riskId}`
- `category` (string: TDS | PF | ESI | PT)
- `ruleId` (string)
- `severity` (string)
- `message` (string)
- `employeeId` (string)
- `meta` (map)
- `createdAt` (timestamp)
