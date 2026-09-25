import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api/client.js';
import Card from '../components/ui/Card.jsx';
import Badge, { EmptyState } from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import Input, { Select } from '../components/ui/Input.jsx';
import { formatThaiDate, formatTime } from '../utils/date.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import UserAvatar from '../components/common/UserAvatar.jsx';

const ROLE_CONFIG = {
  admin: {
    label: 'ผู้ดูแลระบบ (Admin)',
    shortLabel: 'Admin',
    icon: '👑',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800',
    desc: 'สิทธิ์สูงสุด จัดการผู้ใช้งาน กำหนดยศ เพิ่ม/แก้ไขห้องพัก และรีเซ็ตข้อมูลระบบ',
  },
  user: {
    label: 'ผู้ใช้งานทั่วไป (User)',
    shortLabel: 'User',
    icon: '👤',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    desc: 'สิทธิ์จองห้องเรียนและตรวจสอบสถานะการอนุมัติการจองทั่วไป',
  },
};

function formatEquipment(b) {
  const items = b.equipment || [];
  const other = b.otherEquipment?.trim();
  if (!items.length && !other) return '-';
  const parts = [];
  if (items.length) parts.push(items.join(', '));
  if (other) parts.push(`(อื่นๆ: ${other})`);
  return parts.join(' ');
}

function timeAgo(ts) {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'เมื่อสักครู่';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diffHour / 24)} วันที่แล้ว`;
}

export default function AdminPage() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [userLogs, setUserLogs] = useState([]);
  const [userLogSearch, setUserLogSearch] = useState('');
  const [userLogActionFilter, setUserLogActionFilter] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search & Filter
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [bookingSearch, setBookingSearch] = useState('');
  const [dateRange, setDateRange] = useState({ dateFrom: '', dateTo: '' });

  // Bulk Selection
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedBookingIds, setSelectedBookingIds] = useState([]);

  // Modals
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [targetRoleUser, setTargetRoleUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('user');
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [roomForm, setRoomForm] = useState({ name: '', capacity: '', building: 'อาคารหลัก', type: 'classroom', status: 'active' });

  // System Settings State (การตั้งค่าระบบเว็บทุกมิติ)
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [newBlackoutDate, setNewBlackoutDate] = useState('');
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newSubjectYear, setNewSubjectYear] = useState('5');
  const [newSubjectCode, setNewSubjectCode] = useState('');

  // Reset User Password Modal
  const [resetUserTarget, setResetUserTarget] = useState(null);
  const [newAdminSetPassword, setNewAdminSetPassword] = useState('');
  const [resetPassSubmitting, setResetPassSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const params = {};
      if (dateRange.dateFrom) params.dateFrom = dateRange.dateFrom;
      if (dateRange.dateTo) params.dateTo = dateRange.dateTo;

      const [u, b, r, logs, userActivityLogs, s] = await Promise.all([
        api.getUsers(),
        api.getBookings(params),
        api.getRooms(),
        api.getAuditLogs().catch(() => []),
        api.getUserLogs().catch(() => []),
        api.getSettings().catch(() => null),
      ]);
      setUsers(u);
      setBookings(b);
      setRooms(r);
      setAuditLogs(logs);
      setUserLogs(userActivityLogs);
      if (s) setSettings(s);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [dateRange, showToast]);

  const { subscribe } = useSocket();

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Real-time WebSockets: อัปเดตข้อมูลแบบทันทีทันใดเมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    const unsub1 = subscribe('BOOKINGS_UPDATED', () => loadAll());
    const unsub2 = subscribe('USERS_UPDATED', () => loadAll());
    const unsub3 = subscribe('ROOMS_UPDATED', () => loadAll());
    const unsub4 = subscribe('SETTINGS_UPDATED', () => loadAll());
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [subscribe, loadAll]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAll();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Reset all bookings system
  const handleResetBookings = async () => {
    setResetSubmitting(true);
    try {
      const res = await api.resetBookings();
      showToast(res.message || 'รีเซ็ตล้างข้อมูลการจองเรียบร้อยแล้ว');
      setResetModalOpen(false);
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setResetSubmitting(false);
    }
  };

  // User & Role Actions
  const openRoleModal = (user) => {
    setTargetRoleUser(user);
    setSelectedRole(user.role === 'admin' ? 'admin' : 'user');
    setRoleModalOpen(true);
  };

  const handleUpdateRole = async () => {
    if (!targetRoleUser) return;
    setRoleSubmitting(true);
    try {
      const res = await api.updateUserRole(targetRoleUser.id, selectedRole);
      showToast(res.message || 'อัปเดตสิทธิ์ผู้ใช้งานสำเร็จ');
      setRoleModalOpen(false);
      setTargetRoleUser(null);
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRoleSubmitting(false);
    }
  };

  const handleResetUserPassword = async (e) => {
    e.preventDefault();
    if (!resetUserTarget || !newAdminSetPassword) return;
    if (newAdminSetPassword.length < 8) {
      showToast('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร', 'error');
      return;
    }
    setResetPassSubmitting(true);
    try {
      const res = await api.resetUserPassword(resetUserTarget.id, newAdminSetPassword);
      showToast(res.message || 'รีเซ็ตรหัสผ่านสำเร็จ');
      setResetUserTarget(null);
      setNewAdminSetPassword('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setResetPassSubmitting(false);
    }
  };

  const handleSaveSettings = async (updatedFields) => {
    setSettingsSaving(true);
    try {
      const newSettings = await api.updateSettings({
        advanceBookingDays: updatedFields.advance_booking_days !== undefined ? updatedFields.advance_booking_days : settings?.advance_booking_days,
        blackoutDates: updatedFields.blackout_dates !== undefined ? updatedFields.blackout_dates : settings?.blackout_dates,
        subjects: updatedFields.subjects !== undefined ? updatedFields.subjects : settings?.subjects,
        equipment: updatedFields.equipment !== undefined ? updatedFields.equipment : settings?.equipment,
        equipmentLimits: updatedFields.equipment_limits !== undefined ? updatedFields.equipment_limits : settings?.equipment_limits,
        equipmentStock: updatedFields.equipment_stock !== undefined ? updatedFields.equipment_stock : settings?.equipment_stock,
        timeWindows: updatedFields.time_windows !== undefined ? updatedFields.time_windows : settings?.time_windows,
        siteTitle: updatedFields.site_title !== undefined ? updatedFields.site_title : settings?.site_title,
        contactInfo: updatedFields.contact_info !== undefined ? updatedFields.contact_info : settings?.contact_info,
        allowRegistration: updatedFields.allow_registration !== undefined ? updatedFields.allow_registration : settings?.allow_registration,
        requireApproval: updatedFields.require_approval !== undefined ? updatedFields.require_approval : settings?.require_approval,
      });
      setSettings(newSettings);
      showToast('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว');
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  const approveUserWithRole = async (id, roleToAssign = 'user') => {
    try {
      await api.approveUser(id, roleToAssign);
      showToast('อนุมัติผู้ใช้งานเรียบร้อยแล้ว');
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const removeUser = async (id) => {
    const ok = await confirm({
      title: 'ยืนยันลบผู้ใช้งาน',
      message: 'คุณต้องการลบบัญชีผู้ใช้งานนี้ออกจากระบบ? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
      confirmText: 'ลบผู้ใช้งาน',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteUser(id);
      showToast('ลบผู้ใช้งานสำเร็จ');
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const bulkApproveUsers = async () => {
    if (!selectedUserIds.length) return;
    for (const id of selectedUserIds) {
      await api.approveUser(id).catch(() => {});
    }
    showToast(`อนุมัติผู้ใช้ ${selectedUserIds.length} รายการสำเร็จ`);
    setSelectedUserIds([]);
    loadAll();
  };

  const confirmBooking = async (id) => {
    await api.updateBookingStatus(id, 'confirmed');
    showToast('ยืนยันการจองสำเร็จ');
    loadAll();
  };

  const bulkConfirmBookings = async () => {
    if (!selectedBookingIds.length) return;
    for (const id of selectedBookingIds) {
      await api.updateBookingStatus(id, 'confirmed').catch(() => {});
    }
    showToast(`ยืนยันการจอง ${selectedBookingIds.length} รายการสำเร็จ`);
    setSelectedBookingIds([]);
    loadAll();
  };

  const openCancelModal = (id) => {
    setCancelTarget(id);
    setCancelReason('');
  };

  const submitCancel = async () => {
    if (!cancelReason.trim()) return showToast('กรุณาระบุเหตุผลในการยกเลิก', 'error');
    setCancelSubmitting(true);
    try {
      await api.updateBookingStatus(cancelTarget, 'cancelled', cancelReason.trim());
      showToast('ยกเลิกการจองสำเร็จ');
      setCancelTarget(null);
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handleSaveRoom = async (e) => {
    e.preventDefault();
    try {
      if (editingRoom) {
        await api.updateRoom(editingRoom.id, roomForm);
        showToast('แก้ไขข้อมูลห้องสำเร็จ');
      } else {
        await api.createRoom(roomForm);
        showToast('เพิ่มห้องใหม่สำเร็จ');
      }
      setRoomModalOpen(false);
      setEditingRoom(null);
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const toggleRoomStatus = async (room) => {
    const nextStatus = room.status === 'maintenance' ? 'active' : 'maintenance';
    await api.updateRoom(room.id, { status: nextStatus });
    showToast(`เปลี่ยนสถานะห้อง ${room.name} เป็น ${nextStatus === 'maintenance' ? 'ปิดปรับปรุง' : 'ใช้งานปกติ'}`);
    loadAll();
  };

  const deleteRoom = async (id) => {
    const ok = await confirm({
      title: 'ยืนยันลบห้อง',
      message: 'คุณต้องการลบห้องนี้ออกจากระบบ? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
      confirmText: 'ลบห้อง',
      variant: 'danger',
    });
    if (!ok) return;
    await api.deleteRoom(id);
    showToast('ลบห้องสำเร็จ');
    loadAll();
  };

  // Log Actions (Export & Clear)
  const handleClearAuditLogs = async () => {
    const ok = await confirm({
      title: '🗑️ ยืนยันล้างประวัติ Admin Audit Logs',
      message: 'คุณต้องการล้างประวัติการดำเนินการของแอดมินทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้ (แต่ระบบจะบันทึก Log การล้างนี้ไว้)',
      confirmText: 'ล้าง Log ทั้งหมด',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await api.clearAuditLogs();
      showToast(res.message || 'ล้างประวัติ Audit Logs สำเร็จ');
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleExportAuditLogs = async () => {
    try {
      showToast('กำลังส่งออกไฟล์ CSV...');
      await api.exportAuditLogs();
      showToast('ดาวน์โหลด Admin Audit Logs เรียบร้อย');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleClearUserLogs = async () => {
    const ok = await confirm({
      title: '🗑️ ยืนยันล้างประวัติ User Activity Logs',
      message: 'คุณต้องการล้างประวัติกิจกรรมของผู้ใช้งานทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้',
      confirmText: 'ล้าง Log ทั้งหมด',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await api.clearUserLogs();
      showToast(res.message || 'ล้างประวัติ User Logs สำเร็จ');
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleExportUserLogs = async () => {
    try {
      showToast('กำลังส่งออกไฟล์ CSV...');
      await api.exportUserLogs();
      showToast('ดาวน์โหลด User Activity Logs เรียบร้อย');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Filtered lists
  const pendingUsers = useMemo(() => users.filter((u) => !u.approved), [users]);
  const filteredPendingUsers = useMemo(
    () => pendingUsers.filter((u) => !userSearch || u.displayName.toLowerCase().includes(userSearch.toLowerCase()) || u.username.toLowerCase().includes(userSearch.toLowerCase())),
    [pendingUsers, userSearch]
  );

  const approvedUsers = useMemo(() => users.filter((u) => u.approved), [users]);
  const filteredApprovedUsers = useMemo(
    () =>
      approvedUsers.filter((u) => {
        const matchesSearch =
          !userSearch ||
          u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.username.toLowerCase().includes(userSearch.toLowerCase());
        const userRole = u.role === 'admin' ? 'admin' : 'user';
        const matchesRole = roleFilter === 'all' || userRole === roleFilter;
        return matchesSearch && matchesRole;
      }),
    [approvedUsers, userSearch, roleFilter]
  );

  const filteredBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          !bookingSearch ||
          b.roomName.toLowerCase().includes(bookingSearch.toLowerCase()) ||
          b.bookerName.toLowerCase().includes(bookingSearch.toLowerCase())
      ),
    [bookings, bookingSearch]
  );

  const pendingBookings = useMemo(() => bookings.filter((b) => b.status === 'pending'), [bookings]);
  const activeRooms = useMemo(() => rooms.filter((r) => r.status !== 'maintenance'), [rooms]);
  const maintenanceRooms = useMemo(() => rooms.filter((r) => r.status === 'maintenance'), [rooms]);

  if (loading) return <EmptyState>กำลังโหลดข้อมูลผู้ดูแลระบบ...</EmptyState>;

  return (
    <div className="grid gap-6">
      {/* Modern Executive Admin Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400 text-2xl font-black shadow-inner border border-brand-200/60 dark:border-brand-900/50">
              🛡️
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                  ศูนย์ควบคุมผู้ดูแลระบบ
                </h1>
                <span className="rounded-lg bg-brand-100 px-2.5 py-0.5 text-xs font-black text-brand-800 dark:bg-brand-950 dark:text-brand-300 border border-brand-300 dark:border-brand-800">
                  Admin Control Center
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                จัดการสิทธิ์ยศผู้ใช้งาน (Admin / User) อนุมัติการจอง บริหารจัดการห้องเรียน และล้างข้อมูลระบบ
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRefresh}
              className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition active:scale-95 cursor-pointer ${
                isRefreshing ? 'opacity-70' : ''
              }`}
            >
              <span className={isRefreshing ? 'animate-spin inline-block' : ''}>🔄</span>
              <span>รีเฟรชข้อมูล</span>
            </button>

            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95 cursor-pointer"
            >
              <span>🗑️</span>
              <span>รีเซ็ตข้อมูลการจอง</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overview KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 shadow-sm dark:border-amber-900/50 dark:from-amber-950/30 dark:to-amber-900/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300">ผู้ใช้รออนุมัติ</p>
            <span className="text-xl">⏳</span>
          </div>
          <p className="mt-2 text-3xl font-black text-amber-700 dark:text-amber-300">{pendingUsers.length}</p>
          <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-400">รอเปิดสิทธิ์ใช้งานระบบ</p>
        </div>

        <div className="rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50 to-brand-100/50 p-5 shadow-sm dark:border-brand-900/50 dark:from-brand-950/30 dark:to-brand-900/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-brand-900 dark:text-brand-300">การจองรอยืนยัน</p>
            <span className="text-xl">📅</span>
          </div>
          <p className="mt-2 text-3xl font-black text-brand-700 dark:text-brand-300">{pendingBookings.length}</p>
          <p className="mt-1 text-[11px] text-brand-800/80 dark:text-brand-400">รอแอดมินยืนยันคำขอ</p>
        </div>

        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 shadow-sm dark:border-blue-900/50 dark:from-blue-950/30 dark:to-blue-900/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-300">ห้องใช้งานปกติ</p>
            <span className="text-xl">🚪</span>
          </div>
          <p className="mt-2 text-3xl font-black text-blue-700 dark:text-blue-300">{activeRooms.length}</p>
          <p className="mt-1 text-[11px] text-blue-800/80 dark:text-blue-400">พร้อมรองรับการจอง</p>
        </div>

        <div className="rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50 to-rose-100/50 p-5 shadow-sm dark:border-rose-900/50 dark:from-rose-950/30 dark:to-rose-900/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-rose-900 dark:text-rose-300">ห้องปิดปรับปรุง</p>
            <span className="text-xl">🔧</span>
          </div>
          <p className="mt-2 text-3xl font-black text-rose-700 dark:text-rose-300">{maintenanceRooms.length}</p>
          <p className="mt-1 text-[11px] text-rose-800/80 dark:text-rose-400">อยู่ระหว่างซ่อมบำรุง</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto dark:border-slate-700 gap-2 scrollbar-none">
        {[
          { id: 'overview', label: '👑 จัดการผู้ใช้งานและยศ (Admin & User)', count: pendingUsers.length },
          { id: 'bookings', label: '📅 จัดการการจองห้อง', count: pendingBookings.length },
          { id: 'rooms', label: '🚪 จัดการห้องพัก (CRUD)', count: rooms.length },
          { id: 'settings', label: '⚙️ ตั้งค่าระบบเว็บ & กฎเกณฑ์' },
          { id: 'audit', label: '🛡️ Admin Audit Logs', count: auditLogs.length },
          { id: 'user-logs', label: '📋 User Activity Logs', count: userLogs.length },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2.5 border-b-2 px-5 py-3.5 text-sm font-extrabold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/20 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 rounded-t-xl'
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                  tab.count > 0
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : 'bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: USER MANAGEMENT (ADMIN & USER ROLES ONLY) */}
      {activeTab === 'overview' && (
        <Card title="จัดการผู้ใช้งานและกำหนดสิทธิ์ยศ (Admin & User)" icon="👑">
          {/* Controls & Filter Bar */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="relative w-full sm:w-72">
                <input
                  type="search"
                  placeholder="🔍 ค้นหาชื่อผู้ใช้ หรือ username..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Role filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                {[
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'admin', label: '👑 Admin' },
                  { id: 'user', label: '👤 User' },
                ].map((rf) => (
                  <button
                    key={rf.id}
                    type="button"
                    onClick={() => setRoleFilter(rf.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                      roleFilter === rf.id
                        ? 'bg-slate-900 text-white dark:bg-brand-500 dark:text-slate-950 shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {rf.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedUserIds.length > 0 && (
              <Button variant="primary" size="sm" onClick={bulkApproveUsers}>
                ✓ อนุมัติผู้ใช้ที่เลือก ({selectedUserIds.length})
              </Button>
            )}
          </div>

          {/* Pending Users Section */}
          {filteredPendingUsers.length > 0 && (
            <section className="mb-8 rounded-2xl border border-amber-300/70 bg-gradient-to-r from-amber-50 to-orange-50/40 p-5 shadow-sm dark:border-amber-900/50 dark:from-amber-950/40 dark:to-orange-950/20">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-amber-900 dark:text-amber-300 flex items-center gap-2">
                    <span>⏳ รายชื่อผู้ใช้งานรอการอนุมัติ</span>
                    <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-black text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                      {filteredPendingUsers.length} รายการ
                    </span>
                  </h3>
                  <p className="text-xs text-amber-800/80 dark:text-amber-400">เลือกสิทธิ์ (Admin / User) และกดอนุมัติเพื่อเปิดใช้งานบัญชี</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white dark:border-amber-900/50 dark:bg-slate-900 shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-amber-100/80 text-left text-xs font-extrabold text-amber-950 dark:bg-amber-950/80 dark:text-amber-300">
                    <tr>
                      <th className="p-3.5 w-10">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.length === filteredPendingUsers.length && filteredPendingUsers.length > 0}
                          onChange={(e) => setSelectedUserIds(e.target.checked ? filteredPendingUsers.map((u) => u.id) : [])}
                        />
                      </th>
                      <th className="p-3.5">ชื่อ-นามสกุล</th>
                      <th className="p-3.5">ชื่อผู้ใช้ (Username)</th>
                      <th className="p-3.5">สิทธิ์การใช้งาน</th>
                      <th className="p-3.5 text-right">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingUsers.map((u) => {
                      return (
                        <tr key={u.id} className="border-t border-amber-100 dark:border-amber-900/30 hover:bg-amber-50/50 dark:hover:bg-amber-950/30 transition">
                          <td className="p-3.5">
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(u.id)}
                              onChange={(e) =>
                                setSelectedUserIds((prev) =>
                                  e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                                )
                              }
                            />
                          </td>
                          <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">{u.displayName}</td>
                          <td className="p-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">{u.username}</td>
                          <td className="p-3.5">
                            <select
                              defaultValue={u.role === 'admin' ? 'admin' : 'user'}
                              id={`select-role-${u.id}`}
                              className="rounded-xl border border-amber-300 bg-amber-50/50 px-2.5 py-1 text-xs font-bold text-slate-800 dark:border-amber-800 dark:bg-slate-800 dark:text-slate-200 outline-none"
                            >
                              <option value="user">👤 ผู้ใช้งานทั่วไป (User)</option>
                              <option value="admin">👑 ผู้ดูแลระบบ (Admin)</option>
                            </select>
                          </td>
                          <td className="p-3.5">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const selectEl = document.getElementById(`select-role-${u.id}`);
                                  const chosenRole = selectEl ? selectEl.value : 'user';
                                  approveUserWithRole(u.id, chosenRole);
                                }}
                              >
                                ✓ อนุมัติเข้าใช้
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => removeUser(u.id)}>
                                ปฏิเสธ/ลบ
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Approved Users Section with Role Assignment */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>👥 รายชื่อผู้ใช้งานในระบบทั้งหมด</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {filteredApprovedUsers.length} คน
                </span>
              </h3>
            </div>

            {filteredApprovedUsers.length === 0 ? (
              <EmptyState>ไม่พบผู้ใช้งานตามเงื่อนไขที่ระบุ</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100/70 text-left text-xs font-extrabold text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                    <tr>
                      <th className="p-3.5">ผู้ใช้งาน</th>
                      <th className="p-3.5">Username</th>
                      <th className="p-3.5">ยศ / สิทธิ์ปัจจุบัน</th>
                      <th className="p-3.5">คำอธิบายสิทธิ์</th>
                      <th className="p-3.5 text-right">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredApprovedUsers.map((u) => {
                      const userRoleKey = u.role === 'admin' ? 'admin' : 'user';
                      const cfg = ROLE_CONFIG[userRoleKey];
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar
                                avatar={u.avatar}
                                name={u.displayName}
                                size="md"
                              />
                              <div>
                                <p className="font-bold text-slate-900 dark:text-slate-100">{u.displayName}</p>
                                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                  {u.department && <span>🏛️ {u.department}</span>}
                                  {u.phone && <span>📞 {u.phone}</span>}
                                  {!u.department && !u.phone && <span>ID: {u.id.substring(0, 8)}...</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">{u.username}</td>
                          <td className="p-3.5">
                            <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-black uppercase shadow-xs ${cfg.badgeClass}`}>
                              <span>{cfg.icon}</span>
                              <span>{cfg.shortLabel}</span>
                            </span>
                          </td>
                          <td className="p-3.5 max-w-[280px]">
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{cfg.desc}</p>
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex justify-end gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setResetUserTarget(u);
                                  setNewAdminSetPassword('');
                                }}
                                className="inline-flex items-center gap-1 rounded-xl bg-amber-50 hover:bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800 border border-amber-300 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 dark:text-amber-300 dark:border-amber-800 transition cursor-pointer"
                                title="แอดมินตั้งรหัสผ่านใหม่ให้ผู้ใช้"
                              >
                                🔑 ตั้งรหัสใหม่
                              </button>
                              <button
                                type="button"
                                onClick={() => openRoleModal(u)}
                                className="inline-flex items-center gap-1 rounded-xl bg-purple-50 hover:bg-purple-100 px-3 py-1.5 text-xs font-black text-purple-800 border border-purple-300 dark:bg-purple-950/70 dark:hover:bg-purple-900/80 dark:text-purple-300 dark:border-purple-800 transition cursor-pointer"
                              >
                                ⚡ เปลี่ยนยศ
                              </button>
                              <Button size="sm" variant="danger" onClick={() => removeUser(u.id)}>
                                ลบผู้ใช้
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </Card>
      )}

      {/* TAB 2: BOOKINGS */}
      {activeTab === 'bookings' && (
        <Card title="จัดการการจองห้อง" icon="📅">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-3 sm:grid-cols-3 flex-1">
              <input
                type="search"
                placeholder="ค้นหาชื่อห้อง หรือผู้จอง..."
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                ตั้งแต่วันที่
                <input type="date" className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-800" value={dateRange.dateFrom} onChange={(e) => setDateRange({ ...dateRange, dateFrom: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                ถึงวันที่
                <input type="date" className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-800" value={dateRange.dateTo} onChange={(e) => setDateRange({ ...dateRange, dateTo: e.target.value })} />
              </label>
            </div>

            <Button variant="danger" size="sm" onClick={() => setResetModalOpen(true)}>
              🗑️ ล้างข้อมูลการจองทั้งหมด ({bookings.length})
            </Button>
          </div>

          {selectedBookingIds.length > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-xl bg-brand-50 p-3 dark:bg-brand-950/40">
              <span className="text-xs font-bold text-brand-800 dark:text-brand-300">เลือก {selectedBookingIds.length} รายการ</span>
              <Button size="sm" variant="secondary" onClick={bulkConfirmBookings}>✓ ยืนยันการจองทั้งหมดที่เลือก</Button>
            </div>
          )}

          {filteredBookings.length === 0 ? (
            <EmptyState>ไม่พบรายการจอง</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 dark:bg-slate-800">
                  <tr>
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedBookingIds.length === filteredBookings.filter((b) => b.status === 'pending').length && filteredBookings.filter((b) => b.status === 'pending').length > 0}
                        onChange={(e) =>
                          setSelectedBookingIds(
                            e.target.checked ? filteredBookings.filter((b) => b.status === 'pending').map((b) => b.id) : []
                          )
                        }
                      />
                    </th>
                    <th className="p-3">ห้อง</th>
                    <th className="p-3">วันที่</th>
                    <th className="p-3">เวลา</th>
                    <th className="p-3">ผู้จอง</th>
                    <th className="p-3">วัตถุประสงค์</th>
                    <th className="p-3">อุปกรณ์ที่ขอ</th>
                    <th className="p-3">สถานะ</th>
                    <th className="p-3 text-right">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                      <td className="p-3">
                        {b.status === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selectedBookingIds.includes(b.id)}
                            onChange={(e) =>
                              setSelectedBookingIds((prev) =>
                                e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)
                              )
                            }
                          />
                        )}
                      </td>
                      <td className="p-3 font-semibold">{b.roomName}</td>
                      <td className="p-3">{formatThaiDate(b.date)}</td>
                      <td className="p-3">{formatTime(b.start)}–{formatTime(b.end)}</td>
                      <td className="p-3">{b.bookerName}</td>
                      <td className="p-3 max-w-[170px]" title={b.otherPurpose || ''}>
                        <div className="truncate">{[...b.purpose, ...b.subjects].join(', ') || '-'}</div>
                        {b.otherPurpose && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{b.otherPurpose}</div>
                        )}
                      </td>
                      <td className="p-3 max-w-[150px]">{formatEquipment(b)}</td>
                      <td className="p-3">
                        <Badge status={b.status} />
                        {b.status === 'cancelled' && b.cancelReason && (
                          <p className="mt-1 max-w-[180px] text-xs text-red-500 dark:text-red-400">เหตุผล: {b.cancelReason}</p>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          {b.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => confirmBooking(b.id)}>ยืนยัน</Button>}
                          {b.status !== 'cancelled' && <Button size="sm" variant="danger" onClick={() => openCancelModal(b.id)}>ยกเลิก</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: ROOMS (CRUD) */}
      {activeTab === 'rooms' && (
        <Card title="จัดการห้องเรียนและห้องประชุม (CRUD)" icon="🚪">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-slate-500">จัดการ เพิ่ม แก้ไข และตั้งสถานะเปิด/ปิดปรับปรุงห้องในระบบ</p>
            <Button variant="primary" size="sm" onClick={() => {
              setEditingRoom(null);
              setRoomForm({ name: '', capacity: '40 คน', building: 'อาคารหลัก', type: 'classroom', status: 'active' });
              setRoomModalOpen(true);
            }}>
              + เพิ่มห้องใหม่
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-[700px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 dark:bg-slate-800">
                <tr>
                  <th className="p-3">ชื่อห้อง</th>
                  <th className="p-3">ความจุ</th>
                  <th className="p-3">อาคาร</th>
                  <th className="p-3">ประเภท</th>
                  <th className="p-3">สถานะห้อง</th>
                  <th className="p-3 text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{r.name}</td>
                    <td className="p-3">{r.capacity}</td>
                    <td className="p-3">{r.building || 'อาคารหลัก'}</td>
                    <td className="p-3 font-mono text-xs uppercase">{r.type}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${r.status === 'maintenance' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'}`}>
                        {r.status === 'maintenance' ? '🔧 ปิดปรับปรุง' : '✓ ใช้งานปกติ'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => toggleRoomStatus(r)}>
                          {r.status === 'maintenance' ? 'เปิดใช้งาน' : 'ปิดปรับปรุง'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingRoom(r);
                          setRoomForm({ name: r.name, capacity: r.capacity, building: r.building || '', type: r.type || 'classroom', status: r.status || 'active' });
                          setRoomModalOpen(true);
                        }}>
                          แก้ไข
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => deleteRoom(r.id)}>ลบ</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB: ADMIN AUDIT LOGS */}
      {activeTab === 'audit' && (() => {
        const ACTION_BADGE = {
          CONFIRM_BOOKING: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
          CANCEL_BOOKING: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
          APPROVE_USER: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
          UPDATE_USER_ROLE: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
          DELETE_USER: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
          RESET_USER_PASSWORD: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
          RESET_BOOKINGS: 'bg-rose-200 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
          CREATE_ROOM: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
          UPDATE_ROOM: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
          DELETE_ROOM: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
          UPDATE_SETTINGS: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
        };
        const filtered = auditLogs.filter((l) =>
          !auditSearch ||
          l.adminName.toLowerCase().includes(auditSearch.toLowerCase()) ||
          l.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
          l.details.toLowerCase().includes(auditSearch.toLowerCase())
        );
        return (
          <Card title="🛡️ Admin Audit Logs — ประวัติการดำเนินการของผู้ดูแลระบบ" icon="📜">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-1 items-center gap-2 min-w-[220px]">
                <input
                  type="search"
                  placeholder="ค้นหา action, แอดมิน, รายละเอียด..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">{filtered.length} รายการ</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportAuditLogs}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shadow-sm transition cursor-pointer"
                  title="ดาวน์โหลด Log เป็นไฟล์ CSV"
                >
                  📥 ส่งออก CSV
                </button>
                <button
                  type="button"
                  onClick={handleClearAuditLogs}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70 shadow-sm transition cursor-pointer"
                  title="ล้างประวัติ Admin Audit Logs ทั้งหมด"
                >
                  🗑️ รีเซ็ต Log
                </button>
              </div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState>ยังไม่มีประวัติการบันทึก Audit Log</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="p-3 whitespace-nowrap">เวลา</th>
                      <th className="p-3">แอดมิน</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">รายละเอียด</th>
                      <th className="p-3">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log) => (
                      <tr key={log.id} className="border-t border-slate-100 text-xs dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3 text-slate-400 whitespace-nowrap">
                          <div>{timeAgo(log.createdAt)}</div>
                          <div className="text-[10px] text-slate-300 dark:text-slate-600">{new Date(log.createdAt).toLocaleString('th-TH')}</div>
                        </td>
                        <td className="p-3 font-bold text-slate-700 dark:text-slate-200">{log.adminName}</td>
                        <td className="p-3">
                          <span className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-black font-mono ${ACTION_BADGE[log.action] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-800 dark:text-slate-200 max-w-[320px]">
                          <div className="leading-relaxed whitespace-pre-wrap break-words">
                            {log.details.split(' | ').map((part, i) => (
                              <span key={i} className={i === 0 ? 'font-bold' : ''}>
                                {i > 0 && <span className="text-slate-400 mx-1">·</span>}
                                {part}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-[11px] text-slate-400 font-mono">
                          {log.target ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {log.target}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })()}

      {/* TAB: USER ACTIVITY LOGS */}
      {activeTab === 'user-logs' && (() => {
        const USER_ACTION_BADGE = {
          LOGIN: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
          REGISTER: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
          BOOK_ROOM: 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300',
          BOOK_RECURRING: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
          EDIT_BOOKING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
          CANCEL_BOOKING: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
          CHANGE_PASSWORD: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
        };
        const USER_ACTION_ICON = {
          LOGIN: '🔑',
          REGISTER: '✍️',
          BOOK_ROOM: '📅',
          BOOK_RECURRING: '🔁',
          EDIT_BOOKING: '✏️',
          CANCEL_BOOKING: '❌',
          CHANGE_PASSWORD: '🔒',
        };
        const filteredUserLogs = userLogs.filter((l) => {
          const matchSearch = !userLogSearch ||
            l.userName.toLowerCase().includes(userLogSearch.toLowerCase()) ||
            l.details.toLowerCase().includes(userLogSearch.toLowerCase());
          const matchAction = userLogActionFilter === 'all' || l.action === userLogActionFilter;
          return matchSearch && matchAction;
        });
        return (
          <div className="grid gap-4">
            <Card title="📋 User Activity Logs — กิจกรรมการใช้งานของผู้ใช้งานทั่วไป" icon="👤">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[240px]">
                  <input
                    type="search"
                    placeholder="ค้นหาชื่อผู้ใช้, รายละเอียด..."
                    value={userLogSearch}
                    onChange={(e) => setUserLogSearch(e.target.value)}
                    className="flex-1 min-w-[180px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                  <select
                    value={userLogActionFilter}
                    onChange={(e) => setUserLogActionFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold dark:border-slate-600 dark:bg-slate-800"
                  >
                    <option value="all">ทุก Action</option>
                    <option value="LOGIN">🔑 LOGIN</option>
                    <option value="REGISTER">✍️ REGISTER</option>
                    <option value="BOOK_ROOM">📅 BOOK_ROOM</option>
                    <option value="BOOK_RECURRING">🔁 BOOK_RECURRING</option>
                    <option value="EDIT_BOOKING">✏️ EDIT_BOOKING</option>
                    <option value="CANCEL_BOOKING">❌ CANCEL_BOOKING</option>
                    <option value="CHANGE_PASSWORD">🔒 CHANGE_PASSWORD</option>
                  </select>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{filteredUserLogs.length} รายการ</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportUserLogs}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shadow-sm transition cursor-pointer"
                    title="ดาวน์โหลด Log เป็นไฟล์ CSV"
                  >
                    📥 ส่งออก CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleClearUserLogs}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70 shadow-sm transition cursor-pointer"
                    title="ล้างประวัติ User Activity Logs ทั้งหมด"
                  >
                    🗑️ รีเซ็ต Log
                  </button>
                </div>
              </div>

              {filteredUserLogs.length === 0 ? (
                <EmptyState>ไม่พบรายการกิจกรรมผู้ใช้งาน</EmptyState>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-[820px] w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 dark:bg-slate-800">
                      <tr>
                        <th className="p-3 whitespace-nowrap">เวลา</th>
                        <th className="p-3">ผู้ใช้งาน</th>
                        <th className="p-3">Action</th>
                        <th className="p-3">รายละเอียด</th>
                        <th className="p-3">ข้อมูลเพิ่มเติม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUserLogs.map((log) => (
                        <tr key={log.id} className="border-t border-slate-100 text-xs dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="p-3 text-slate-400 whitespace-nowrap">
                            <div>{timeAgo(log.createdAt)}</div>
                            <div className="text-[10px] text-slate-300 dark:text-slate-600">{new Date(log.createdAt).toLocaleString('th-TH')}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-700 dark:text-slate-200">{log.userName}</div>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-black font-mono ${USER_ACTION_BADGE[log.action] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                              {USER_ACTION_ICON[log.action] || '📌'} {log.action}
                            </span>
                          </td>
                          <td className="p-3 max-w-[280px]">
                            <div className="text-slate-800 dark:text-slate-200 leading-relaxed">
                              {log.details.split(' | ').map((part, i) => (
                                <span key={i}>
                                  {i > 0 && <span className="text-slate-300 dark:text-slate-600 mx-1">·</span>}
                                  <span className={i === 0 ? 'font-bold' : 'text-slate-500 dark:text-slate-400'}>{part}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 max-w-[200px]">
                            {log.meta && (
                              <div className="space-y-0.5">
                                {log.meta.roomName && (
                                  <div className="text-[11px]">
                                    <span className="font-bold text-slate-500">ห้อง:</span>
                                    <span className="ml-1 text-slate-700 dark:text-slate-300">{log.meta.roomName}</span>
                                  </div>
                                )}
                                {log.meta.date && (
                                  <div className="text-[11px]">
                                    <span className="font-bold text-slate-500">วัน:</span>
                                    <span className="ml-1 text-slate-700 dark:text-slate-300">{log.meta.date}</span>
                                  </div>
                                )}
                                {log.meta.purpose?.length > 0 && (
                                  <div className="text-[11px]">
                                    <span className="font-bold text-slate-500">วัตถุประสงค์:</span>
                                    <span className="ml-1 text-slate-700 dark:text-slate-300">{log.meta.purpose.join(', ')}</span>
                                  </div>
                                )}
                                {log.meta.equipment?.length > 0 && (
                                  <div className="text-[11px]">
                                    <span className="font-bold text-slate-500">อุปกรณ์:</span>
                                    <span className="ml-1 text-slate-700 dark:text-slate-300">{log.meta.equipment.join(', ')}</span>
                                  </div>
                                )}
                                {log.meta.created != null && (
                                  <div className="text-[11px]">
                                    <span className="font-bold text-green-600">สำเร็จ {log.meta.created} ครั้ง</span>
                                    {log.meta.skipped > 0 && <span className="ml-1 text-amber-600">(ข้าม {log.meta.skipped})</span>}
                                  </div>
                                )}
                                {log.meta.role && (
                                  <div className="text-[11px]">
                                    <span className="font-bold text-slate-500">ยศ:</span>
                                    <span className="ml-1 text-slate-700 dark:text-slate-300">{log.meta.role}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        );
      })()}

      {/* TAB 4: SYSTEM SETTINGS (แอดมินจัดการได้ทุกระบบของเว็บ) */}
      {activeTab === 'settings' && (
        <div className="grid gap-6">
          <Card title="⚙️ ศูนย์กลางควบคุมการตั้งค่าระบบและกฎเกณฑ์ของเว็บ" icon="🛠️">
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              แอดมินสามารถปรับเปลี่ยนกฎเกณฑ์ทั้งหมดได้โดยตรงจากหน้านี้ ข้อมูลจะถูกบันทึกลงฐานข้อมูลและมีผลใช้งานทันทีทั่วทั้งระบบโดยไม่ต้องเข้าไปแก้ไขไฟล์โค้ด
            </p>

            {settings ? (
              <div className="grid gap-6">
                {/* กลุ่ม 1: กฎการจองและระยะเวลา */}
                <div className="rounded-2xl border border-slate-200/80 p-5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
                    <span>⏳ 1. กฎระยะเวลาการจองล่วงหน้า</span>
                  </h4>
                  <div className="grid gap-4 sm:grid-cols-2 items-end">
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                        อนุญาตให้จองล่วงหน้าได้สูงสุด (วัน)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={settings.advance_booking_days || 90}
                        onChange={(e) => setSettings({ ...settings, advance_booking_days: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        กำหนดว่าผู้ใช้จะสามารถกดเลือกวันจองล่วงหน้าได้ไม่เกินกี่วันนับจากวันนี้
                      </span>
                    </div>
                    <div>
                      <Button
                        variant="primary"
                        loading={settingsSaving}
                        onClick={() => handleSaveSettings({ advance_booking_days: settings.advance_booking_days })}
                      >
                        💾 บันทึกจำนวนวันจองล่วงหน้า
                      </Button>
                    </div>
                  </div>
                </div>

                {/* กลุ่ม 2: วันปิดงดให้บริการ (Blackout Dates) */}
                <div className="rounded-2xl border border-slate-200/80 p-5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-2">
                    <span>🛑 2. วันปิดงดให้บริการ / วันหยุดพิเศษ (Blackout Dates)</span>
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">
                    วันที่กำหนดในนี้ ระบบจะไม่อนุญาตให้ผู้ใช้ทั่วไปทำการจองห้องใดๆ ทั้งสิ้น
                  </p>

                  <div className="flex flex-wrap gap-2 mb-4 items-center">
                    <input
                      type="date"
                      value={newBlackoutDate}
                      onChange={(e) => setNewBlackoutDate(e.target.value)}
                      className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (!newBlackoutDate) return showToast('กรุณาเลือกวันที่', 'error');
                        const currentDates = settings.blackout_dates || [];
                        if (currentDates.includes(newBlackoutDate)) return showToast('มีวันที่นี้อยู่ในรายการแล้ว', 'error');
                        const updated = [...currentDates, newBlackoutDate].sort();
                        handleSaveSettings({ blackout_dates: updated });
                        setNewBlackoutDate('');
                      }}
                    >
                      + เพิ่มวันปิดให้บริการ
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(settings.blackout_dates || []).length === 0 ? (
                      <span className="text-xs text-slate-400 italic">ไม่มีการกำหนดวันหยุด/วันปิดงดให้บริการ</span>
                    ) : (
                      (settings.blackout_dates || []).map((dateStr) => (
                        <span
                          key={dateStr}
                          className="inline-flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-800 dark:bg-rose-950/60 dark:border-rose-900 dark:text-rose-300"
                        >
                          <span>📅 {dateStr} ({formatThaiDate(dateStr)})</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = settings.blackout_dates.filter((d) => d !== dateStr);
                              handleSaveSettings({ blackout_dates: updated });
                            }}
                            className="h-4 w-4 rounded-full bg-rose-200 hover:bg-rose-300 text-rose-800 flex items-center justify-center text-[10px] font-black cursor-pointer"
                            title="ลบวันหยุดนี้"
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* กลุ่ม 3: จัดการรายการอุปกรณ์เสริม (Equipment Management) */}
                <div className="rounded-2xl border border-slate-200/80 p-5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-2">
                    <span>📦 3. จัดการรายการอุปกรณ์ที่ให้ขอเพิ่มได้</span>
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">
                    เพิ่ม ลบ หรือแก้ไขตัวเลือกอุปกรณ์ที่จะแสดงในหน้าต่างการจองของผู้ใช้
                  </p>

                  <div className="flex flex-wrap gap-2 mb-4 items-center">
                    <input
                      type="text"
                      placeholder="ชื่ออุปกรณ์ใหม่ (เช่น สายสัญญาณเสียง, ขาตั้งไมค์)"
                      value={newEquipmentName}
                      onChange={(e) => setNewEquipmentName(e.target.value)}
                      className="min-w-[260px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const name = newEquipmentName.trim();
                        if (!name) return showToast('กรุณาระบุชื่ออุปกรณ์', 'error');
                        const currentEq = settings.equipment || [];
                        if (currentEq.includes(name)) return showToast('มีอุปกรณ์นี้อยู่แล้ว', 'error');
                        const updated = [...currentEq, name];
                        handleSaveSettings({ equipment: updated });
                        setNewEquipmentName('');
                      }}
                    >
                      + เพิ่มอุปกรณ์ใหม่
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    {(settings.equipment || []).map((eq) => (
                      <span
                        key={eq}
                        className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-xs"
                      >
                        <span>{eq}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'ลบอุปกรณ์',
                              message: `ต้องการลบตัวเลือกอุปกรณ์ "${eq}" หรือไม่?`,
                              confirmText: 'ลบอุปกรณ์',
                              variant: 'danger',
                            });
                            if (!ok) return;
                            const updated = settings.equipment.filter((item) => item !== eq);
                            handleSaveSettings({ equipment: updated });
                          }}
                          className="h-4 w-4 rounded-full bg-slate-200 hover:bg-red-200 hover:text-red-800 text-slate-600 flex items-center justify-center text-[10px] font-black cursor-pointer"
                          title="ลบอุปกรณ์นี้"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* กลุ่ม 3b: กำหนด Min/Max โควต้าและสต็อกรวมของแต่ละอุปกรณ์ */}
                <div className="rounded-2xl border border-amber-200/60 p-5 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-1">
                    <span>🔢 3b. กำหนดโควต้า Max และสต็อกรวมของแต่ละอุปกรณ์</span>
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">
                    <strong>Max (สูงสุด)</strong> = โควตาที่ผู้ใช้ขอได้ต่อการจอง 1 ครั้ง | <strong>สต็อกรวม</strong> = จำนวนของจริงทั้งหมดในองค์กร (หมุนเวียนตามช่วงเวลาจริง)
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(settings.equipment || []).map((item) => {
                      const currentLimit = (settings.equipment_limits || {})[item] || { min: 0, max: 5, unit: 'ชิ้น', icon: '📦' };
                      const currentStock = (settings.equipment_stock || {})[item] !== undefined
                        ? (settings.equipment_stock || {})[item]
                        : currentLimit.max;
                      return (
                        <div key={item} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-3.5">
                          <p className="text-xs font-black text-slate-700 dark:text-slate-200 mb-2.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <span>{currentLimit.icon}</span>
                              <span>{item}</span>
                            </span>
                            <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                              คลังมี {currentStock} {currentLimit.unit || 'ชิ้น'}
                            </span>
                          </p>
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            <div>
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Max/ครั้ง</label>
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={currentLimit.max}
                                onChange={(e) => {
                                  const newMax = Math.max(1, Number(e.target.value) || 1);
                                  const updatedLimits = {
                                    ...(settings.equipment_limits || {}),
                                    [item]: { ...currentLimit, max: newMax },
                                  };
                                  setSettings({ ...settings, equipment_limits: updatedLimits });
                                }}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-brand-600 dark:text-brand-400 block mb-1">สต็อกรวม</label>
                              <input
                                type="number"
                                min={1}
                                max={999}
                                value={currentStock}
                                onChange={(e) => {
                                  const newStock = Math.max(1, Number(e.target.value) || 1);
                                  const updatedStock = {
                                    ...(settings.equipment_stock || {}),
                                    [item]: newStock,
                                  };
                                  setSettings({ ...settings, equipment_stock: updatedStock });
                                }}
                                className="w-full rounded-lg border border-brand-300 bg-brand-50/40 px-2 py-1.5 text-sm font-bold text-brand-800 dark:border-brand-600 dark:bg-brand-950/40 dark:text-brand-200"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">หน่วยนับ</label>
                              <input
                                type="text"
                                placeholder="ชิ้น, ตัว..."
                                value={currentLimit.unit}
                                onChange={(e) => {
                                  const updatedLimits = {
                                    ...(settings.equipment_limits || {}),
                                    [item]: { ...currentLimit, unit: e.target.value },
                                  };
                                  setSettings({ ...settings, equipment_limits: updatedLimits });
                                }}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                              />
                            </div>
                          </div>
                          {/* progress bar preview */}
                          <div className="mt-1.5">
                            <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                              <span>Max จอง: {currentLimit.max}</span>
                              <span>สต็อกทั้งหมด: {currentStock} {currentLimit.unit}</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500" style={{ width: '100%' }} />
                            </div>
                            <div className="flex justify-between text-[10px] mt-0.5">
                              <span className="text-emerald-600 font-bold">ปกติ</span>
                              <span className="text-amber-600 font-bold">ปานกลาง</span>
                              <span className="text-rose-600 font-bold">โควตาเต็ม</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {(settings.equipment || []).length > 0 && (
                    <div className="mt-4">
                      <Button
                        variant="primary"
                        loading={settingsSaving}
                        onClick={() => handleSaveSettings({
                          equipment_limits: settings.equipment_limits,
                          equipment_stock: settings.equipment_stock,
                        })}
                      >
                        💾 บันทึกโควต้าและสต็อกอุปกรณ์ทั้งหมด
                      </Button>
                    </div>
                  )}
                </div>

                {/* กลุ่ม 4: จัดการรหัสรายวิชาตามชั้นปี (Subjects by Year) */}
                <div className="rounded-2xl border border-slate-200/80 p-5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-2">
                    <span>📚 4. จัดการรหัสวิชาเรียนตามชั้นปี</span>
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">
                    รายวิชาที่จะโผล่ให้ผู้ใช้ติ๊กเลือกเมื่อเลือกวัตถุประสงค์ "การเรียนการสอน"
                  </p>

                  <div className="flex flex-wrap gap-2 mb-4 items-center">
                    <select
                      value={newSubjectYear}
                      onChange={(e) => setNewSubjectYear(e.target.value)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="5">ชั้นปีที่ 5</option>
                      <option value="6">ชั้นปีที่ 6</option>
                      <option value="7">ชั้นปีที่ 7</option>
                    </select>
                    <input
                      type="text"
                      placeholder="รหัสวิชา เช่น CHMD 5201"
                      value={newSubjectCode}
                      onChange={(e) => setNewSubjectCode(e.target.value)}
                      className="min-w-[200px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const code = newSubjectCode.trim().toUpperCase();
                        if (!code) return showToast('กรุณาระบุรหัสวิชา', 'error');
                        const currentSub = { ...(settings.subjects || {}) };
                        const yearList = currentSub[newSubjectYear] || [];
                        if (yearList.includes(code)) return showToast('มีรหัสวิชานี้อยู่แล้วในชั้นปีดังกล่าว', 'error');
                        currentSub[newSubjectYear] = [...yearList, code];
                        handleSaveSettings({ subjects: currentSub });
                        setNewSubjectCode('');
                      }}
                    >
                      + เพิ่มรหัสวิชา
                    </Button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    {[5, 6, 7].map((year) => {
                      const list = (settings.subjects || {})[year] || [];
                      return (
                        <div key={year} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 bg-white dark:bg-slate-800">
                          <p className="text-xs font-black text-slate-800 dark:text-slate-200 mb-2 border-b border-slate-100 dark:border-slate-700 pb-1.5 flex justify-between">
                            <span>ชั้นปีที่ {year}</span>
                            <span className="text-slate-400 font-normal">({list.length} วิชา)</span>
                          </p>
                          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                            {list.length === 0 ? (
                              <span className="text-[11px] text-slate-400">ยังไม่มีรายวิชา</span>
                            ) : (
                              list.map((sub) => (
                                <span
                                  key={sub}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-2 py-1 text-[11px] font-bold text-blue-800 dark:bg-blue-950/60 dark:border-blue-900 dark:text-blue-300"
                                >
                                  <span>{sub}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentSub = { ...(settings.subjects || {}) };
                                      currentSub[year] = (currentSub[year] || []).filter((s) => s !== sub);
                                      handleSaveSettings({ subjects: currentSub });
                                    }}
                                    className="h-3.5 w-3.5 rounded-full hover:bg-blue-200 text-blue-700 flex items-center justify-center font-black cursor-pointer"
                                    title="ลบวิชานี้"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* กลุ่ม 5: นโยบายการสมัครสมาชิกและข้อความเว็บ */}
                <div className="rounded-2xl border border-slate-200/80 p-5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
                    <span>🛡️ 5. นโยบายการสมัครสมาชิก & การอนุมัติผู้ใช้งาน</span>
                  </h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.allow_registration !== false}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setSettings({ ...settings, allow_registration: val });
                          handleSaveSettings({ allow_registration: val });
                        }}
                        className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 rounded"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">เปิดรับการสมัครสมาชิกใหม่</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">หากปิด จะไม่อนุญาตให้บุคคลภายนอกกดสร้างบัญชีใหม่หน้าเว็บ</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.require_approval !== false}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setSettings({ ...settings, require_approval: val });
                          handleSaveSettings({ require_approval: val });
                        }}
                        className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 rounded"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">ต้องให้แอดมินอนุมัติก่อนเข้าใช้งาน</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">หากปิด ผู้สมัครใหม่จะสามารถล็อกอินเข้าจองห้องได้ทันทีโดยไม่ต้องรออนุมัติ</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* กลุ่ม 6: ข้อมูลส่วนหัวเว็บและคำชี้แจง */}
                <div className="rounded-2xl border border-slate-200/80 p-5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
                    <span>🌐 6. ชื่อหัวเว็บและข้อมูลการติดต่อ</span>
                  </h4>
                  <div className="grid gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">ชื่อระบบ (Site Title)</label>
                      <input
                        type="text"
                        value={settings.site_title || ''}
                        onChange={(e) => setSettings({ ...settings, site_title: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">คำแนะนำ / ช่องทางติดต่อผู้ดูแล</label>
                      <input
                        type="text"
                        value={settings.contact_info || ''}
                        onChange={(e) => setSettings({ ...settings, contact_info: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex justify-end mt-2">
                      <Button
                        variant="primary"
                        loading={settingsSaving}
                        onClick={() => handleSaveSettings({ site_title: settings.site_title, contact_info: settings.contact_info })}
                      >
                        💾 บันทึกข้อมูลเว็บไซต์
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState>กำลังโหลดข้อมูลการตั้งค่าระบบ...</EmptyState>
            )}
          </Card>
        </div>
      )}

      {/* Modal: Change User Role (Admin / User Only) */}
      <Modal open={roleModalOpen} onClose={() => setRoleModalOpen(false)} title={`⚡ สลับยศผู้ใช้งาน (Admin / User)`} size="md">
        {targetRoleUser && (
          <div className="grid gap-5">
            <div className="rounded-2xl bg-slate-100/70 p-4 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">ผู้ใช้งานเป้าหมาย</p>
                  <p className="text-base font-black text-slate-900 dark:text-slate-100">{targetRoleUser.displayName}</p>
                  <p className="font-mono text-xs text-slate-500">@{targetRoleUser.username}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">ยศปัจจุบัน</p>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-bold uppercase ${ROLE_CONFIG[targetRoleUser.role === 'admin' ? 'admin' : 'user']?.badgeClass}`}>
                    {ROLE_CONFIG[targetRoleUser.role === 'admin' ? 'admin' : 'user']?.icon} {ROLE_CONFIG[targetRoleUser.role === 'admin' ? 'admin' : 'user']?.shortLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                เลือกระดับยศ/สิทธิ์ที่ต้องการมอบหมาย:
              </label>

              {Object.entries(ROLE_CONFIG).map(([key, config]) => {
                const isSelected = selectedRole === key;
                return (
                  <div
                    key={key}
                    onClick={() => setSelectedRole(key)}
                    className={`flex items-start gap-3.5 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/40 shadow-sm ring-2 ring-brand-500/20'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <input
                      type="radio"
                      name="userRoleRadio"
                      checked={isSelected}
                      onChange={() => setSelectedRole(key)}
                      className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{config.icon}</span>
                        <p className="font-bold text-slate-900 dark:text-slate-100">{config.label}</p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-normal">{config.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex gap-3 justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
              <Button type="button" variant="neutral" onClick={() => setRoleModalOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="button" variant="primary" loading={roleSubmitting} onClick={handleUpdateRole}>
                💾 บันทึกการเปลี่ยนยศ
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Reset All Bookings Confirmation */}
      <Modal open={resetModalOpen} onClose={() => setResetModalOpen(false)} title="🚨 ยืนยันการรีเซ็ตข้อมูลการจองทั้งหมด" size="sm">
        <div className="grid gap-4">
          <div className="rounded-2xl bg-red-50 p-4 border border-red-200 dark:bg-red-950/40 dark:border-red-900/50">
            <p className="text-sm font-bold text-red-800 dark:text-red-300 flex items-center gap-2">
              <span>⚠️ คำเตือนการล้างข้อมูล!</span>
            </p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-400 leading-relaxed">
              การดำเนินการนี้จะทำการลบข้อมูลรายการจองห้องทั้งหมดในระบบจำนวน <strong className="underline">{bookings.length} รายการ</strong> ออกจากฐานข้อมูลถาวร และไม่สามารถกู้คืนกลับมาได้
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="neutral" onClick={() => setResetModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="danger" loading={resetSubmitting} onClick={handleResetBookings}>
              🗑️ ยืนยันล้างข้อมูลทั้งหมด
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Cancel Booking Reason */}
      <Modal open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} title="ระบุเหตุผลในการยกเลิก" size="sm">
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">เหตุผล (ผู้จองจะเห็นข้อความนี้)</span>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-sm text-slate-800 outline-none transition-all focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="เช่น ห้องปิดปรับปรุง, ข้อมูลการจองไม่ครบถ้วน, ตารางชนกับกิจกรรมสำคัญ"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="danger" loading={cancelSubmitting} onClick={submitCancel}>ยืนยันยกเลิก</Button>
            <Button variant="neutral" onClick={() => setCancelTarget(null)}>ปิด</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Add/Edit Room */}
      <Modal open={roomModalOpen} onClose={() => setRoomModalOpen(false)} title={editingRoom ? `แก้ไขห้อง ${editingRoom.name}` : 'เพิ่มห้องใหม่'} size="md">
        <form onSubmit={handleSaveRoom} className="grid gap-3">
          <Input label="ชื่อห้อง" value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} required />
          <Input label="ความจุ (เช่น 40 คน)" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })} required />
          <Input label="อาคาร" value={roomForm.building} onChange={(e) => setRoomForm({ ...roomForm, building: e.target.value })} required />
          <Select label="ประเภทห้อง" value={roomForm.type} onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value })}>
            <option value="classroom">ห้องเรียน (Classroom)</option>
            <option value="meeting">ห้องประชุม (Meeting)</option>
            <option value="sim">Sim Lab</option>
          </Select>
          <Select label="สถานะห้อง" value={roomForm.status} onChange={(e) => setRoomForm({ ...roomForm, status: e.target.value })}>
            <option value="active">ใช้งานปกติ (Active)</option>
            <option value="maintenance">ปิดปรับปรุง (Maintenance)</option>
          </Select>
          <div className="mt-2 flex gap-2">
            <Button type="submit" variant="primary">{editingRoom ? 'บันทึกการแก้ไข' : 'เพิ่มห้อง'}</Button>
            <Button type="button" variant="neutral" onClick={() => setRoomModalOpen(false)}>ยกเลิก</Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Admin Reset User Password */}
      <Modal open={Boolean(resetUserTarget)} onClose={() => setResetUserTarget(null)} title="🔑 แอดมินตั้งรหัสผ่านใหม่ให้ผู้ใช้งาน" size="sm">
        {resetUserTarget && (
          <form onSubmit={handleResetUserPassword} className="grid gap-4">
            <div className="rounded-xl bg-amber-50 p-3.5 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/50">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                ผู้ใช้งาน: <strong>{resetUserTarget.displayName}</strong> (@{resetUserTarget.username})
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                เมื่อตั้งรหัสผ่านใหม่แล้ว ผู้ใช้จะสามารถนำรหัสนี้ไปเข้าสู่ระบบได้ทันที
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
              </label>
              <input
                type="text"
                required
                minLength={8}
                placeholder="ระบุรหัสผ่านใหม่ เช่น Pass@1234"
                value={newAdminSetPassword}
                onChange={(e) => setNewAdminSetPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-800 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="flex gap-2 justify-end mt-2">
              <Button type="button" variant="neutral" onClick={() => setResetUserTarget(null)}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="primary" loading={resetPassSubmitting}>
                💾 ยืนยันเปลี่ยนรหัสผ่าน
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
