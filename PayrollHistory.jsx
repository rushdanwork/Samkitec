import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';

import { getFirestoreDb } from './firebaseService.js';

const PAYROLL_COLLECTION = 'payrollRecords';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0);

const formatDate = (value) => {
  if (!value) return '';
  if (typeof value?.toDate === 'function') {
    return value.toDate().toLocaleDateString('en-GB');
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-GB');
};

export default function PayrollHistory() {
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const db = getFirestoreDb();
    const payrollQuery = query(
      collection(db, PAYROLL_COLLECTION),
      orderBy('generatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      payrollQuery,
      (snapshot) => {
        setPayrollRuns(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load payroll history.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="payroll-history__empty">Loading payroll history…</div>;
  }

  if (error) {
    return <div className="payroll-history__error">{error}</div>;
  }

  if (payrollRuns.length === 0) {
    return <div className="payroll-history__empty">No payroll runs found.</div>;
  }

  return (
    <table className="payroll-history">
      <thead>
        <tr>
          <th>Month</th>
          <th>Year</th>
          <th>Employees</th>
          <th>Total Payout</th>
          <th>Generated</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {payrollRuns.map((run) => (
          <tr key={run.id}>
            <td>{run.month}</td>
            <td>{run.year}</td>
            <td>{run.employeeCount ?? 0}</td>
            <td>{formatCurrency(run.totalPayout ?? 0)}</td>
            <td>{formatDate(run.generatedAt) || '-'}</td>
            <td>{run.status || 'Completed'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
