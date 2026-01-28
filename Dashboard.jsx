import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';

import { getFirestoreDb } from './firebaseService.js';

const PAYROLL_COLLECTION = 'payrollRecords';
const ATTENDANCE_COLLECTION = 'attendanceRecords';
const EMPLOYEES_COLLECTION = 'employees';
const COMPLIANCE_COLLECTION = 'complianceFlags';

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
  const [complianceFlags, setComplianceFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    const unsubscribers = [];

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
      onSnapshot(collection(db, COMPLIANCE_COLLECTION), (snapshot) => {
        setComplianceFlags(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      })
    );

    setLoading(false);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
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
      complianceCount: complianceFlags.length,
    };
  }, [attendanceRecords, complianceFlags.length, employees, payrollRuns]);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  return (
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
    </div>
  );
}
