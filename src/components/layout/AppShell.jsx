import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { api } from '../../api/client.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import Input from '../ui/Input.jsx';
import NotificationBell from '../notifications/NotificationBell.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const tabs = [
  { to: '/dashboard', label: 'หน้าหลัก' },
  { to: '/booking', label: 'จองห้อง' },
  { to: '/week-view', label: 'ห้องว่างรายสัปดาห์', shortLabel: 'รายสัปดาห์' },
  { to: '/my-bookings', label: 'การจองของฉัน' },
  { to: '/list', label: 'รายการจอง' },
  { to: '/stats', label: 'สถิติ' },
  { to: '/guide', label: 'วิธีใช้งาน' },
  { to: '/admin', label: 'จัดการระบบ', admin: true },
];

export default function AppShell() {
  const { user, logout, isAdmin } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pending, setPending] = useState({ pendingUsers: 0, pendingBookings: 0 });
  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '', newPasswordConfirm: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchPending = () => api.getPendingCounts().then(setPending).catch(() => {});
    fetchPending();
    const id = setInterval(fetchPending, 5000); // ทุก 5 วิ = near real-time
    return () => clearInterval(id);
  }, [isAdmin]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdLoading(true);
    try {
      await api.changePassword(pwdForm);
      showToast('เปลี่ยนรหัสผ่านสำเร็จ');
      setPwdOpen(false);
      setPwdForm({ oldPassword: '', newPassword: '', newPasswordConfirm: '' });
    } catch (err) {
      setPwdError(err.message);
    } finally {
      setPwdLoading(false);
    }
  };

  const adminBadge = isAdmin ? pending.pendingUsers + pending.pendingBookings : 0;

  return (
    <div className="min-h-screen pb-20 md:pb-10">
      <header className="no-print sticky top-0 z-30 bg-brand-700 text-white shadow-lg dark:bg-slate-900 dark:border-b dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 text-lg font-extrabold">▦</span>
            <div>
              <h1 className="text-base font-bold sm:text-lg">ระบบจองห้อง</h1>
              <p className="hidden text-xs text-white/70 sm:block">{user?.displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {adminBadge > 0 && (
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand-700">{adminBadge} รออนุมัติ</span>
            )}
            <Button variant="ghost" size="sm" className="!text-white hover:!bg-white/20" onClick={toggleTheme}>
              {isDark ? '☀' : '☾'}
            </Button>
            <div data-tour="notification-bell">
              <NotificationBell />
            </div>
            <div className="relative">
              <Button variant="ghost" size="sm" className="!text-white hover:!bg-white/20" onClick={() => setMenuOpen((v) => !v)}>
                {isAdmin && <span className="mr-1 rounded bg-white/20 px-1.5 text-[10px] font-extrabold">Admin</span>}
                เมนู ▾
              </Button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                  <div className="px-3 py-2 sm:hidden border-b border-slate-100 dark:border-slate-700 mb-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{user?.displayName}</p>
                  </div>
                  <button type="button" className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700" onClick={() => { setPwdOpen(true); setMenuOpen(false); }}>เปลี่ยนรหัสผ่าน</button>
                  <button type="button" className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30" onClick={() => { logout(); navigate('/login'); }}>ออกจากระบบ</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Desktop Navigation */}
      <nav className="no-print mx-auto hidden max-w-6xl gap-2 px-4 py-4 md:flex">
        {tabs.filter((t) => !t.admin || isAdmin).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            data-tour={`nav-${tab.to.replace('/', '')}`}
            className={({ isActive }) =>
              `shrink-0 rounded-xl border px-5 py-2 text-sm font-bold transition-all ${
                isActive
                  ? 'border-brand-600 bg-brand-600 text-white shadow-md'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:bg-slate-700'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="no-print fixed bottom-0 left-0 z-40 flex w-full justify-around border-t border-slate-200 bg-white/90 p-2 pb-safe backdrop-blur-lg md:hidden dark:border-slate-800 dark:bg-slate-950/90">
        {tabs.filter((t) => !t.admin || isAdmin).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 rounded-xl p-2 text-[10px] font-bold transition-all ${
                isActive
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`
            }
          >
            <span className="text-lg leading-none">{tab.to === '/booking' ? '📅' : tab.to === '/week-view' ? '🗓️' : tab.to === '/my-bookings' ? '👤' : tab.to === '/list' ? '📋' : tab.to === '/stats' ? '📊' : tab.to === '/admin' ? '⚙️' : '🏠'}</span>
            {tab.shortLabel || tab.label}
          </NavLink>
        ))}
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-4 md:py-0">
        <Outlet />
      </main>

      <Modal open={pwdOpen} onClose={() => setPwdOpen(false)} title="เปลี่ยนรหัสผ่าน" size="sm">
        <form className="grid gap-3" onSubmit={handleChangePassword}>
          <Input label="รหัสผ่านปัจจุบัน" type="password" value={pwdForm.oldPassword} onChange={(e) => setPwdForm({ ...pwdForm, oldPassword: e.target.value })} required />
          <Input label="รหัสผ่านใหม่" type="password" value={pwdForm.newPassword} onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })} required />
          <Input label="ยืนยันรหัสผ่านใหม่" type="password" value={pwdForm.newPasswordConfirm} onChange={(e) => setPwdForm({ ...pwdForm, newPasswordConfirm: e.target.value })} required />
          {pwdError && <p className="text-sm text-red-600">{pwdError}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={pwdLoading}>บันทึก</Button>
            <Button variant="neutral" onClick={() => setPwdOpen(false)}>ยกเลิก</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
