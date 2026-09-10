import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import Card from '../components/ui/Card.jsx';
import Badge, { EmptyState } from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Input.jsx';
import BookingModal from '../components/booking/BookingModal.jsx';
import { formatThaiDate, formatTime } from '../utils/date.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

function formatEquipment(b) {
  const items = b.equipment || [];
  const other = b.otherEquipment?.trim();
  if (!items.length && !other) return '-';
  const parts = [];
  if (items.length) parts.push(items.join(', '));
  if (other) parts.push(`(อื่นๆ: ${other})`);
  return parts.join(' ');
}

export default function MyBookingsPage() {
  const { showToast } = useToast();
  const { subscribe } = useSocket();
  const confirm = useConfirm();
  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [meta, setMeta] = useState(null);
  const [editingBooking, setEditingBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => api.getBookings({ mine: 'true' }).then(setBookings).finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.getRooms().then(setRooms);
    api.getRoomMeta().then(setMeta);
  }, []);

  useEffect(() => {
    const unsub = subscribe('BOOKINGS_UPDATED', () => load());
    return () => unsub();
  }, [subscribe]);

  const [cancelTarget, setCancelTarget] = useState(null);

  const handleCancelClick = async (b) => {
    if (b.seriesId) {
      setCancelTarget(b);
    } else {
      const ok = await confirm({
        title: 'ยืนยันยกเลิกการจอง',
        message: 'คุณต้องการยกเลิกการจองนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
        confirmText: 'ยกเลิกการจอง',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await api.cancelBooking(b.id);
        showToast('ยกเลิกการจองสำเร็จ');
        load();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  };

  const cancelSingle = async () => {
    if (!cancelTarget) return;
    try {
      await api.cancelBooking(cancelTarget.id);
      showToast('ยกเลิกการจองรายการนี้เรียบร้อยแล้ว');
      setCancelTarget(null);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const cancelSeries = async () => {
    if (!cancelTarget) return;
    try {
      const res = await api.cancelBookingSeries(cancelTarget.seriesId);
      showToast(res.message || 'ยกเลิกการจองซ้ำทั้งชุดเรียบร้อยแล้ว');
      setCancelTarget(null);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const printSlip = (b) => {
    const printWin = window.open('', '_blank', 'width=650,height=700');
    if (!printWin) return alert('กรุณาอนุญาตให้เปิด Pop-up ในเบราว์เซอร์');
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ใบยืนยันการจองห้อง - ${b.roomName}</title>
        <style>
          body { font-family: 'IBM Plex Sans Thai', sans-serif; padding: 30px; color: #1c2321; line-height: 1.6; }
          .ticket { border: 2px solid #0f6e5c; border-radius: 12px; padding: 24px; max-width: 500px; margin: auto; }
          .header { border-bottom: 2px dashed #0f6e5c; padding-bottom: 12px; margin-bottom: 16px; text-align: center; }
          .header h2 { margin: 0; color: #0f6e5c; font-size: 20px; }
          .header p { margin: 4px 0 0; font-size: 12px; color: #666; }
          .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
          .label { font-weight: bold; color: #555; }
          .val { font-weight: 600; text-align: right; }
          .footer { border-top: 1px solid #ddd; margin-top: 20px; padding-top: 12px; text-align: center; font-size: 11px; color: #888; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            <h2>ใบยืนยันการจองห้อง</h2>
            <p>ระบบจองห้องเรียนและห้องประชุม</p>
          </div>
          <div class="row"><span class="label">เลขที่การจอง:</span><span class="val">#BOOK-${b.id}</span></div>
          <div class="row"><span class="label">ห้องที่จอง:</span><span class="val">${b.roomName}</span></div>
          <div class="row"><span class="label">วันที่:</span><span class="val">${formatThaiDate(b.date)}</span></div>
          <div class="row"><span class="label">เวลา:</span><span class="val">${formatTime(b.start)} – ${formatTime(b.end)} น.</span></div>
          <div class="row"><span class="label">ผู้จอง:</span><span class="val">${b.bookerName || 'คุณ'}</span></div>
          <div class="row"><span class="label">อุปกรณ์ที่ขอ:</span><span class="val">${formatEquipment(b)}</span></div>
          <div class="row"><span class="label">สถานะ:</span><span class="val" style="color:#0f6e5c;">✓ ยืนยันเรียบร้อย</span></div>
          <div class="footer">
            <p>พิมพ์เมื่อ: ${new Date().toLocaleString('th-TH')}</p>
            <button class="no-print" onclick="window.print()" style="padding: 8px 16px; background: #0f6e5c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">พิมพ์เอกสาร</button>
          </div>
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  const editingRoom = editingBooking
    ? rooms.find((r) => r.id === editingBooking.roomId) || { id: editingBooking.roomId, name: editingBooking.roomName, capacity: '' }
    : null;

  const canEdit = (b) => b.status !== 'cancelled';

  if (loading) return <EmptyState>กำลังโหลด...</EmptyState>;

  return (
    <Card title="การจองของฉัน" icon="◷">
      {bookings.length === 0 ? (
        <EmptyState>ยังไม่มีการจอง</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="p-3">ห้อง</th>
                <th className="p-3">วันที่</th>
                <th className="p-3">เวลา</th>
                <th className="p-3">อุปกรณ์ที่ขอ</th>
                <th className="p-3">สถานะ</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="p-3 font-semibold">
                    <div>{b.roomName}</div>
                    {b.seriesId && (
                      <span className="inline-block mt-1 text-[11px] font-bold text-violet-700 bg-violet-100 dark:bg-violet-950/60 dark:text-violet-300 px-2 py-0.5 rounded-full">
                        ↻ จองซ้ำรายสัปดาห์
                      </span>
                    )}
                  </td>
                  <td className="p-3">{formatThaiDate(b.date)}</td>
                  <td className="p-3">{formatTime(b.start)}–{formatTime(b.end)}</td>
                  <td className="p-3">{formatEquipment(b)}</td>
                  <td className="p-3">
                    <Badge status={b.status} />
                    {b.status === 'cancelled' && b.cancelReason && (
                      <p className="mt-1 max-w-[220px] text-xs text-red-600 dark:text-red-400">เหตุผล: {b.cancelReason}</p>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      {b.status === 'confirmed' && (
                        <Button size="sm" variant="outline" onClick={() => printSlip(b)}>พิมพ์ใบจอง</Button>
                      )}
                      {canEdit(b) && meta && (
                        <Button size="sm" variant="outline" onClick={() => setEditingBooking(b)}>แก้ไข</Button>
                      )}
                      {b.status !== 'cancelled' && (
                        <Button size="sm" variant="danger" onClick={() => handleCancelClick(b)}>ยกเลิก</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-[200] grid place-items-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setCancelTarget(null)} />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="text-violet-600">↻</span> ยกเลิกการจองซ้ำรายสัปดาห์
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              รายการจองห้อง <span className="font-semibold text-slate-900 dark:text-white">{cancelTarget.roomName}</span> วันที่ {formatThaiDate(cancelTarget.date)} เป็นส่วนหนึ่งของการจองซ้ำรายสัปดาห์ คุณต้องการยกเลิกอย่างไร?
            </p>
            <div className="flex flex-col gap-2.5">
              <Button variant="danger" onClick={cancelSeries}>
                ยกเลิกการจองซ้ำทั้งชุด (ทุกสัปดาห์)
              </Button>
              <Button variant="outline" onClick={cancelSingle}>
                ยกเลิกเฉพาะรายการสัปดาห์นี้เท่านั้น
              </Button>
              <Button variant="ghost" onClick={() => setCancelTarget(null)}>
                ปิดหน้าต่าง
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingBooking && meta && (
        <BookingModal
          open={Boolean(editingBooking)}
          onClose={() => setEditingBooking(null)}
          room={editingRoom}
          draft={{ date: editingBooking.date, period: editingBooking.period, start: editingBooking.start, end: editingBooking.end }}
          meta={meta}
          mode="edit"
          editingBooking={editingBooking}
          onSuccess={load}
        />
      )}
    </Card>
  );
}

export function ListPage() {
  const { isAdmin } = useAuth();
  const { subscribe } = useSocket();
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [filters, setFilters] = useState({ roomId: '', date: '' });
  const [loading, setLoading] = useState(true);

  const loadBookings = () => {
    setLoading(true);
    api.getBookings(filters).then(setBookings).finally(() => setLoading(false));
  };

  useEffect(() => {
    api.getRooms().then(setRooms);
  }, []);

  useEffect(() => {
    loadBookings();
  }, [filters]);

  useEffect(() => {
    const unsub1 = subscribe('BOOKINGS_UPDATED', () => loadBookings());
    const unsub2 = subscribe('ROOMS_UPDATED', () => api.getRooms().then(setRooms));
    return () => {
      unsub1();
      unsub2();
    };
  }, [subscribe, filters]);

  const exportCsv = async () => {
    const res = await api.exportCsv(filters);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookings.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card title="รายการจองทั้งหมด" icon="▤">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Select label="กรองตามห้อง" value={filters.roomId} onChange={(e) => setFilters({ ...filters, roomId: e.target.value })}>
          <option value="">ทั้งหมด</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">กรองตามวันที่</span>
          <input type="date" className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-slate-800 outline-none transition-all focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:bg-slate-800" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        </label>
        {isAdmin && (
          <div className="flex items-end">
            <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          </div>
        )}
      </div>
      {loading ? <EmptyState>กำลังโหลด...</EmptyState> : bookings.length === 0 ? (
        <EmptyState>ไม่มีรายการจอง</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-[850px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="p-3">ห้อง</th>
                <th className="p-3">วันที่</th>
                <th className="p-3">เวลา</th>
                <th className="p-3">ผู้จอง</th>
                <th className="p-3">วัตถุประสงค์</th>
                <th className="p-3">อุปกรณ์ที่ขอ</th>
                <th className="p-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {bookings.filter((b) => b.status !== 'cancelled').map((b) => (
                <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-3 font-semibold">{b.roomName}</td>
                  <td className="p-3">{formatThaiDate(b.date)}</td>
                  <td className="p-3">{formatTime(b.start)}–{formatTime(b.end)}</td>
                  <td className="p-3">{b.bookerName}</td>
                  <td className="p-3">
                    <div>{[...b.purpose, ...b.subjects].join(', ') || '-'}</div>
                    {b.otherPurpose && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{b.otherPurpose}</div>
                    )}
                  </td>
                  <td className="p-3">{formatEquipment(b)}</td>
                  <td className="p-3"><Badge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

