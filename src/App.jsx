import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import WeekViewPage from './pages/WeekViewPage.jsx';
import MyBookingsPage, { ListPage } from './pages/ListPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import { EmptyState } from './components/ui/Badge.jsx';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><EmptyState>กำลังโหลด...</EmptyState></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function AdminRoute() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="booking" element={<BookingPage />} />
        <Route path="week-view" element={<WeekViewPage />} />
        <Route path="my-bookings" element={<MyBookingsPage />} />
        <Route path="list" element={<ListPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="admin" element={<AdminRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
