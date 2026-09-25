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

import ProfileModal from '../profile/ProfileModal.jsx';
import UserAvatar from '../common/UserAvatar.jsx';

const tabs = [
  { to: '/dashboard', label: 'หน้าหลัก' },
  { to: '/booking', label: 'จองห้อง' },
  { to: '/week-view', label: 'ห้องว่างรายสัปดาห์', shortLabel: 'รายสัปดาห์' },
  { to: '/my-bookings', label: 'การจองของฉัน' },
  { to: '/list', label: 'รายการจอง' },
  { to: '/stats', label: 'สถิติ' },
  { to: '/admin', label: 'จัดการระบบ', admin: true },
];

export default function AppShell() {
  const { user, logout, isAdmin } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, setPending] = useState({ pendingUsers: 0, pendingBookings: 0 });

  useEffect(() => {
    if (!isAdmin) return;
    const fetchPending = () => api.getPendingCounts().then(setPending).catch(() => {});
    fetchPending();
    const id = setInterval(fetchPending, 5000); // ทุก 5 วิ = near real-time
    return () => clearInterval(id);
  }, [isAdmin]);

  const adminBadge = isAdmin ? pending.pendingUsers + pending.pendingBookings : 0;

  return (
    <div className="min-h-screen pb-20 md:pb-10">
      <header className="no-print sticky top-0 z-30 bg-brand-700 text-white shadow-lg dark:bg-slate-900 dark:border-b dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 text-lg font-extrabold shadow-inner">▦</span>
            <div>
              <h1 className="text-base font-bold sm:text-lg">ระบบจองห้อง</h1>
              <p className="hidden text-xs text-white/70 sm:block">{user?.displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {adminBadge > 0 && (
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand-700 shadow-xs">{adminBadge} รออนุมัติ</span>
            )}
            <Button variant="ghost" size="sm" className="!text-white hover:!bg-white/20" onClick={toggleTheme}>
              {isDark ? '☀' : '☾'}
            </Button>
            <div data-tour="notification-bell">
              <NotificationBell />
            </div>
            
            {/* User Profile Quick Button & Menu */}
            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl bg-white/10 px-2 py-1 text-left text-xs font-semibold text-white transition-all hover:bg-white/20 active:scale-95 cursor-pointer"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <UserAvatar
                  avatar={user?.avatar}
                  name={user?.displayName}
                  size="sm"
                  className="ring-1 ring-white/30"
                />
                <span className="hidden max-w-[120px] truncate sm:inline-block">
                  {user?.displayName || 'ผู้ใช้งาน'}
                </span>
                {isAdmin && <span className="rounded bg-amber-400 px-1 text-[9px] font-black text-amber-950 uppercase">Admin</span>}
                <span className="text-[10px] opacity-70">▾</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-800 animate-fadeIn z-50">
                  <div className="mb-1 flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
                    <UserAvatar
                      avatar={user?.avatar}
                      name={user?.displayName}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{user?.displayName}</p>
                      <p className="truncate text-xs text-slate-400">@{user?.username}</p>
                      {user?.department && (
                        <p className="mt-0.5 truncate text-[11px] font-medium text-brand-600 dark:text-brand-400">
                          {user?.department}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={() => { setProfileOpen(true); setMenuOpen(false); }}
                  >
                    <span>👤</span> โปรไฟล์ส่วนตัว
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    onClick={() => { logout(); navigate('/login'); }}
                  >
                    <span>🚪</span> ออกจากระบบ
                  </button>
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

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
