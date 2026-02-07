import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';

import { getFirestoreDb, listenComplianceSummary } from './firebaseService.js';
import Header from './components/Header.jsx';

const PAYROLL_COLLECTION = 'payrollRecords';
const ATTENDANCE_COLLECTION = 'attendanceRecords';
const EMPLOYEES_COLLECTION = 'employees';
const EXPENSES_COLLECTION = 'expenses';
const normalizeDateKey = (date = new Date()) => date.toISOString().split('T')[0];

const parseTimestamp = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function Dashboard() {
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [employees, setEmployees] = useState([]);
  const [complianceReports, setComplianceReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenseOverview, setExpenseOverview] = useState({
    totalThisMonth: 0,
    topCategory: '—',
    topVendor: '—',
    pendingApprovals: 0,
  });

  useEffect(() => {
    const db = getFirestoreDb();
    const unsubscribers = [];
    let expenseTimeoutId;

    unsubscribers.push(
      onSnapshot(
        query(collection(db, PAYROLL_COLLECTION), orderBy('generatedAt', 'desc')),
        (snapshot) => {
          setPayrollRuns(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        }
      )
    );

    unsubscribers.push(
      onSnapshot(collection(db, ATTENDANCE_COLLECTION), (snapshot) => {
        const records = {};
        snapshot.forEach((docSnap) => {
          records[docSnap.id] = docSnap.data();
        });
        setAttendanceRecords(records);
      })
    );

    unsubscribers.push(
      onSnapshot(collection(db, EMPLOYEES_COLLECTION), (snapshot) => {
        setEmployees(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      })
    );

    unsubscribers.push(
      listenComplianceSummary((reports) => {
        setComplianceReports(reports);
      })
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, EXPENSES_COLLECTION), orderBy('createdAt', 'desc')),
        (snapshot) => {
          if (expenseTimeoutId) clearTimeout(expenseTimeoutId);
          expenseTimeoutId = setTimeout(() => {
            const expenses = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            const currentMonth = new Date().toISOString().slice(0, 7);
            const monthly = expenses.filter((expense) => {
              const dateValue = parseTimestamp(expense.date) || parseTimestamp(expense.createdAt);
              return dateValue && dateValue.toISOString().slice(0, 7) === currentMonth;
            });
            const totalThisMonth = monthly.reduce(
              (sum, expense) => sum + (Number(expense.amount) || 0),
              0
            );
            const pendingApprovals = expenses.filter((expense) => expense.status === 'submitted').length;
            const categoryTotals = monthly.reduce((acc, expense) => {
              const category = expense.category || 'misc';
              acc[category] = (acc[category] || 0) + (Number(expense.amount) || 0);
              return acc;
            }, {});
            const vendorTotals = monthly.reduce((acc, expense) => {
              const vendor = expense.vendor || 'Unknown';
              acc[vendor] = (acc[vendor] || 0) + (Number(expense.amount) || 0);
              return acc;
            }, {});

            const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
            const topVendor = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

            setExpenseOverview({
              totalThisMonth,
              topCategory,
              topVendor,
              pendingApprovals,
            });
          }, 200);
        }
      )
    );

    setLoading(false);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (expenseTimeoutId) clearTimeout(expenseTimeoutId);
    };
  }, []);

  const metrics = useMemo(() => {
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter((emp) => emp.status === 'active').length;
    const todayKey = normalizeDateKey();
    const todaysAttendance = attendanceRecords[todayKey] || {};
    const presentCount = Object.values(todaysAttendance).filter((record) => record.status === 'present').length;
    const attendanceRate = activeEmployees ? Math.round((presentCount / activeEmployees) * 100) : 0;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const processedThisMonth = payrollRuns.reduce((total, run) => {
      const generatedAt = parseTimestamp(run.generatedAt);
      if (generatedAt && generatedAt.toISOString().slice(0, 7) === currentMonth) {
        return total + (run.employeeCount ?? 0);
      }
      return total;
    }, 0);

    const pendingPayroll = Math.max(activeEmployees - processedThisMonth, 0);
    const lastRun = payrollRuns[0];

    return {
      totalEmployees,
      activeEmployees,
      presentCount,
      attendanceRate,
      processedThisMonth,
      pendingPayroll,
      lastRun,
      complianceCount: complianceReports.length,
      complianceRiskCounts: complianceReports.reduce(
        (acc, report) => {
          const level = report.summary?.riskLevel;
          if (level === 'High') acc.high += 1;
          if (level === 'Medium') acc.medium += 1;
          if (level === 'Low') acc.low += 1;
          return acc;
        },
        { high: 0, medium: 0, low: 0 }
      ),
      lastComplianceScan: complianceReports
        .map((report) => parseTimestamp(report.summary?.lastEvaluated))
        .filter(Boolean)
        .sort((a, b) => b.getTime() - a.getTime())[0],
    };
  }, [attendanceRecords, complianceReports, employees, payrollRuns]);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="px-6 py-8">
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h4>Total Employees</h4>
            <p>{metrics.totalEmployees}</p>
          </div>
          <div className="dashboard-card">
            <h4>Attendance Today</h4>
            <p>
              {metrics.presentCount} present · {metrics.attendanceRate}% checked in
            </p>
          </div>
          <div className="dashboard-card">
            <h4>Payroll Status</h4>
            <p>
              Processed {metrics.processedThisMonth} · Pending {metrics.pendingPayroll}
            </p>
          </div>
          <div className="dashboard-card">
            <h4>Last Payroll Run</h4>
            <p>
              {metrics.lastRun
                ? `${metrics.lastRun.month} ${metrics.lastRun.year} · ${metrics.lastRun.employeeCount} employees`
                : 'No runs yet'}
            </p>
          </div>
          <div className="dashboard-card">
            <h4>Compliance Issues</h4>
            <p>{metrics.complianceCount}</p>
          </div>
          <div className="dashboard-card">
            <h4>Compliance Risk Overview</h4>
            <p>
              High {metrics.complianceRiskCounts.high} · Medium {metrics.complianceRiskCounts.medium} · Low{' '}
              {metrics.complianceRiskCounts.low}
            </p>
            <small>
              Last scan:{' '}
              {metrics.lastComplianceScan ? metrics.lastComplianceScan.toLocaleString() : 'Not available'}
            </small>
          </div>
          <div className="dashboard-card">
            <h4>Monthly Expense Overview</h4>
            <p>Total ₹{expenseOverview.totalThisMonth.toLocaleString()}</p>
            <small>
              Top category: {expenseOverview.topCategory} · Top vendor: {expenseOverview.topVendor}
            </small>
            <div className="text-muted">Pending approvals: {expenseOverview.pendingApprovals}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
