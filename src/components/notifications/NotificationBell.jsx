import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';

import { useSocket } from '../../context/SocketContext.jsx';

function timeAgo(ts) {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'เมื่อสักครู่';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} วันที่แล้ว`;
}

const typeIcon = {
  booking_confirmed: '✓',
  booking_cancelled: '✕',
  booking_updated: '✎',
};

export default function NotificationBell() {
  const { subscribe } = useSocket();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef(null);

  const fetchCount = () => api.getUnreadNotificationCount().then((d) => setUnreadCount(d.count)).catch(() => {});

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsub = subscribe('NOTIFICATION_NEW', (data) => {
      setUnreadCount((c) => c + 1);
      api.getNotifications().then((list) => setNotifications(list)).catch(() => {});
    });
    return () => unsub();
  }, [subscribe]);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const data = await api.getNotifications().catch(() => []);
      setNotifications(data);
      setLoaded(true);
    }
  };

  const readOne = async (n) => {
    if (!n.isRead) {
      await api.markNotificationRead(n.id).catch(() => {});
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  const readAll = async () => {
    await api.markAllNotificationsRead().catch(() => {});
    setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="การแจ้งเตือน"
        className="relative grid h-9 w-9 place-items-center rounded-lg text-white transition hover:bg-white/20"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-700">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">การแจ้งเตือน</span>
            {unreadCount > 0 && (
              <button type="button" onClick={readAll} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                อ่านทั้งหมด
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-auto divide-y divide-slate-100 dark:divide-slate-700/60">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">ไม่มีการแจ้งเตือน</p>
            ) : (
              notifications.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => readOne(n)}
                  className={`block w-full px-3.5 py-3 text-left transition-all ${
                    n.isRead
                      ? 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      : 'bg-brand-50/70 font-medium text-slate-900 dark:bg-brand-950/40 dark:text-slate-100 hover:bg-brand-100/60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                      {typeIcon[n.type] || '•'}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs leading-snug font-semibold text-slate-800 dark:text-slate-100">
                        {n.message || 'มีการอัปเดตสถานะการจอง'}
                      </p>
                      <span className="mt-1 block text-[10px] text-slate-400 dark:text-slate-400">{timeAgo(n.createdAt)}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

