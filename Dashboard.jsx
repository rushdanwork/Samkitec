import { useEffect, useMemo, useState } from 'react';
import { onSnapshot, orderBy, query, where } from 'firebase/firestore';

import {
  getFirestoreDb,
  getUserScopedCollectionRef,
  listenComplianceSummary,
  listenToAuthState,
} from './firebaseService.js';
import Header from './components/Header.jsx';

const PAYROLL_RUNS_COLLECTION = 'payrollRuns';
const PAYROLL_RECORDS_COLLECTION = 'payrollRecords';
const ATTENDANCE_COLLECTION = 'attendanceRecords';
const EMPLOYEES_COLLECTION = 'employees';
const normalizeDateKey = (date = new Date()) => date.toISOString().split('T')[0];
const normalizePayrollMonth = (month) => {
  const monthValue = String(month || '').trim();
  if (!monthValue.includes('-')) return monthValue;
  const [year, m] = monthValue.split('-');
  return `${year}-${String(m).padStart(2, '0')}`;
};
const isNormalizedPayrollMonth = (month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || '').trim());

const parseTimestamp = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function Dashboard() {
  const selectedMonth = new Date().toISOString().slice(0, 7);
  const normalizedMonth = normalizePayrollMonth(selectedMonth);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [employees, setEmployees] = useState([]);
  const [complianceReports, setComplianceReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFirestoreDb();
    let dataUnsubscribers = [];

    const resetUiState = () => {
      setPayrollRuns([]);
      setAttendanceRecords({});
      setEmployees([]);
      setComplianceReports([]);
    };

    const unsubscribeAuth = listenToAuthState(({ userId }) => {
      dataUnsubscribers.forEach((unsubscribe) => unsubscribe());
      dataUnsubscribers = [];
      resetUiState();

      if (!userId) {
        setLoading(false);
        return;
      }

      let runsFromNewCollection = [];
      let runsFromLegacyCollection = [];
      const syncRuns = () => {
        const source = runsFromNewCollection.length ? runsFromNewCollection : runsFromLegacyCollection;
        setPayrollRuns(source);
      };

      dataUnsubscribers.push(
        onSnapshot(
          query(
            getUserScopedCollectionRef(PAYROLL_RUNS_COLLECTION, userId),
            where('month', '==', normalizedMonth),
            orderBy('generatedAt', 'desc')
          ),
          (snapshot) => {
            runsFromNewCollection = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            syncRuns();
          }
        )
      );

      dataUnsubscribers.push(
        onSnapshot(
          query(
            getUserScopedCollectionRef(PAYROLL_RECORDS_COLLECTION, userId),
            where('month', '==', normalizedMonth),
            orderBy('generatedAt', 'desc')
          ),
          (snapshot) => {
            runsFromLegacyCollection = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            runsFromLegacyCollection.forEach((run) => {
              if (run?.month && !isNormalizedPayrollMonth(run.month)) {
                console.warn('[Payroll] Found non-normalized month in payrollRecords:', run.month, run.id);
              }
            });
            syncRuns();
          }
        )
      );

      dataUnsubscribers.push(
        onSnapshot(getUserScopedCollectionRef(ATTENDANCE_COLLECTION, userId), (snapshot) => {
          const records = {};
          snapshot.forEach((docSnap) => {
            records[docSnap.id] = docSnap.data()?.records || {};
          });
          setAttendanceRecords(records);
        })
      );

      dataUnsubscribers.push(
        onSnapshot(getUserScopedCollectionRef(EMPLOYEES_COLLECTION, userId), (snapshot) => {
          setEmployees(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        })
      );

      dataUnsubscribers.push(
        listenComplianceSummary(
          (reports) => {
            setComplianceReports(reports);
          },
          undefined,
          userId
        )
      );

      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      dataUnsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [normalizedMonth]);

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
        {employees.length === 0 && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-700">
            No data yet. Start by adding employees.
          </div>
        )}
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
        </div>
      </main>
    </div>
  );
}
