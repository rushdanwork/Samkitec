import { useEffect, useState } from 'react';
import { onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { getFirestoreDb, getUserScopedCollectionRef, listenToAuthState } from './firebaseService.js';
import Header from './components/Header.jsx';

const PAYROLL_RUNS_COLLECTION = 'payrollRuns';
const PAYROLL_RECORDS_COLLECTION = 'payrollRecords';

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
  const selectedMonth = new Date().toISOString().slice(0, 7);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getFirestoreDb();
    let dataUnsubscribers = [];

    const unsubscribeAuth = listenToAuthState(({ userId }) => {
      dataUnsubscribers.forEach((unsubscribe) => unsubscribe());
      dataUnsubscribers = [];
      setPayrollRuns([]);
      setError('');

      if (!userId) {
        setLoading(false);
        return;
      }

      let runsFromNewCollection = [];
      let runsFromLegacyCollection = [];

      const syncRuns = () => {
        setPayrollRuns(runsFromNewCollection.length ? runsFromNewCollection : runsFromLegacyCollection);
        setLoading(false);
      };

      dataUnsubscribers.push(
        onSnapshot(
          query(
            getUserScopedCollectionRef(PAYROLL_RUNS_COLLECTION, userId),
            where('month', '==', selectedMonth),
            orderBy('generatedAt', 'desc')
          ),
          (snapshot) => {
            runsFromNewCollection = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            syncRuns();
          },
          (err) => {
            setError(err.message || 'Failed to load payroll history.');
            setLoading(false);
          }
        )
      );

      dataUnsubscribers.push(
        onSnapshot(
          query(
            getUserScopedCollectionRef(PAYROLL_RECORDS_COLLECTION, userId),
            where('month', '==', selectedMonth),
            orderBy('generatedAt', 'desc')
          ),
          (snapshot) => {
            runsFromLegacyCollection = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            syncRuns();
          },
          () => {
            // Legacy fallback is optional; ignore errors to avoid breaking new collection reads.
          }
        )
      );
    });

    return () => {
      unsubscribeAuth();
      dataUnsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [selectedMonth]);

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
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="px-6 py-8">
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
      </main>
    </div>
  );
}
