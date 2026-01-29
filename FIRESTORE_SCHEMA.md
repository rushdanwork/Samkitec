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
- `month` (string)
- `year` (number)
- `status` (string: Completed | Processing)
- `generatedAt` (timestamp)
- `totalPayout` (number)
- `employeeCount` (number)
- `payrollData` (array)
  - `employeeId` (string)
  - `employeeName` (string)
  - `period` (string)
  - `paymentDate` (string)
  - `paymentMethod` (string)
  - `basicSalary` (number)
  - `allowances` (number)
  - `deductions` (number)
  - `netSalary` (number)

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
