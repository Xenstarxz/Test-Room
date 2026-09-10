import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import Card from '../components/ui/Card.jsx';
import Badge, { EmptyState } from '../components/ui/Badge.jsx';
import Calendar from '../components/booking/Calendar.jsx';
import TimeSelector, { validateTime } from '../components/booking/TimeSelector.jsx';
import BookingModal from '../components/booking/BookingModal.jsx';
import { Select } from '../components/ui/Input.jsx';
import { dateFromKey, formatTime, toDateKey, addDaysToKey, todayKey } from '../utils/date.js';
import { useToast } from '../context/ToastContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';

export default function BookingPage() {
  const { showToast } = useToast();
  const { subscribe } = useSocket();
  const [meta, setMeta] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [period, setPeriod] = useState('morning');
  const [start, setStart] = useState(7);
  const [end, setEnd] = useState(8);
  const [rooms, setRooms] = useState([]);
  const [dayBookings, setDayBookings] = useState([]);
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [minCapacity, setMinCapacity] = useState('');
  const [modalRoom, setModalRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const dateKey = toDateKey(selectedDate);
  const timeError = validateTime(period, start, end, meta?.timeWindows || {});


  const loadAvailability = useCallback(async () => {
    if (!meta || timeError) {
      setRooms([]);
      return;
    }
    const data = await api.getAvailability({ date: dateKey, start, end });
    setRooms(data);
    setLastUpdated(new Date());
  }, [meta, dateKey, start, end, timeError]);

  const loadDayBookings = useCallback(async () => {
    const data = await api.getBookings({ date: dateKey });
    setDayBookings(data.sort((a, b) => a.start - b.start));
  }, [dateKey]);

  useEffect(() => {
    Promise.all([api.getRoomMeta()])
      .then(([m]) => {
        setMeta(m);
        const w = m.timeWindows.morning;
        setStart(w.start);
        setEnd(w.start + 1);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!meta) return;
    loadAvailability();
    loadDayBookings();
  }, [meta, loadAvailability, loadDayBookings]);

  // Real-time WebSockets: อัปเดตสถานะห้องและตารางจองแบบทันทีทันใด
  useEffect(() => {
    const unsub1 = subscribe('BOOKINGS_UPDATED', () => {
      loadAvailability();
      loadDayBookings();
    });
    const unsub2 = subscribe('ROOMS_UPDATED', () => {
      loadAvailability();
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [subscribe, loadAvailability, loadDayBookings]);

  const buildings = useMemo(() => {
    const set = new Set();
    rooms.forEach((r) => r.building && set.add(r.building));
    return Array.from(set);
  }, [rooms]);


  const filteredRooms = useMemo(
    () =>
      rooms.filter((r) => {
        const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.building && r.building.toLowerCase().includes(search.toLowerCase()));
        const matchBuilding = !buildingFilter || r.building === buildingFilter;
        const matchCap = !minCapacity || (r.capacity && parseInt(r.capacity, 10) >= Number(minCapacity));
        return matchSearch && matchBuilding && matchCap;
      }),
    [rooms, search, buildingFilter, minCapacity]
  );

  const onSelectDate = (key) => {
    const d = dateFromKey(key);
    if (!d) return;
    setSelectedDate(d);
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const onPeriodChange = (p) => {
    const w = meta.timeWindows[p];
    setPeriod(p);
    setStart(w.start);
    setEnd(Math.min(w.start + 1, w.end));
  };

  const maxAdvanceDateKey = meta?.advanceBookingDays ? addDaysToKey(todayKey(), meta.advanceBookingDays) : null;

  const openBooking = (room) => {
    if (room.status === 'maintenance') return showToast('ห้องนี้ถูกปิดปรับปรุงชั่วคราว ไม่สามารถจองได้', 'error');
    if (room.disabledReason) return showToast(room.disabledReason, 'error');
    if (timeError) return showToast(timeError, 'error');
    if (room.busy) return showToast('ห้องถูกจองในช่วงเวลานี้แล้ว', 'error');
    setModalRoom(room);
  };


  if (loading) return <EmptyState>กำลังโหลด...</EmptyState>;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div data-tour="step-date">
        <Card title="1. เลือกวันที่" icon="▣">
          <Calendar
            selectedDate={selectedDate}
            viewDate={viewDate}
            onSelect={onSelectDate}
            maxDate={maxAdvanceDateKey}
            onChangeMonth={(dir) => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + dir, 1))}
          />
          <div className="mt-3 max-h-40 space-y-2 overflow-auto">
            <p className="text-xs font-bold text-slate-500">รายการจองวันนี้</p>
            {dayBookings.length === 0 ? (
              <p className="text-xs text-slate-400">ไม่มีรายการจอง</p>
            ) : dayBookings.map((b) => (
              <div key={b.id} className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-2 text-xs dark:bg-amber-950/30">
                <strong>{b.roomName}</strong> · {formatTime(b.start)}–{formatTime(b.end)}
                <Badge status={b.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div data-tour="step-time">
        <Card title="2. เลือกช่วงเวลา" icon="◷">
          <div className="grid gap-3">
            <Select label="ช่วงเวลา" value={period} onChange={(e) => onPeriodChange(e.target.value)}>
              {Object.entries(meta.timeWindows).map(([key, w]) => (
                <option key={key} value={key}>{w.label} ({formatTime(w.start)}–{formatTime(w.end)})</option>
              ))}
            </Select>
            {period !== 'fullday' ? (
              <TimeSelector
                period={period}
                timeWindows={meta.timeWindows}
                start={start}
                end={end}
                onStartChange={setStart}
                onEndChange={setEnd}
                error={timeError}
              />
            ) : (
              <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40">จองทั้งวัน 08:00–16:00</p>
            )}
          </div>
        </Card>
      </div>

      <div data-tour="step-room">
        <Card title="3. เลือกห้อง" icon="▤" note="อัปเดตอัตโนมัติทุก 10 วินาที" className="xl:col-span-1">
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="ค้นหาห้องหรืออาคาร..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
            <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-950/40 dark:text-brand-400">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />
              LIVE
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-500">กรองอาคาร:</span>
            <button
              type="button"
              onClick={() => setBuildingFilter('')}
              className={`rounded-lg px-2 py-0.5 font-medium transition ${!buildingFilter ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              ทั้งหมด
            </button>
            {buildings.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBuildingFilter(b === buildingFilter ? '' : b)}
                className={`rounded-lg px-2 py-0.5 font-medium transition ${buildingFilter === b ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                {b}
              </button>
            ))}

            <span className="ml-2 font-semibold text-slate-500">ความจุขั้นต่ำ:</span>
            <select
              value={minCapacity}
              onChange={(e) => setMinCapacity(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">ทั้งหมด</option>
              <option value="10">10 คน+</option>
              <option value="30">30 คน+</option>
              <option value="50">50 คน+</option>
              <option value="100">100 คน+</option>
            </select>
          </div>
        </div>

        <div className="grid max-h-[520px] grid-cols-1 gap-2 overflow-auto transition-all duration-300 sm:grid-cols-2">
          {filteredRooms.length === 0 ? (
            <div className="col-span-full py-8 text-center text-xs text-slate-400">ไม่พบห้องที่ตรงตามเงื่อนไขค้นหา</div>
          ) : (
            filteredRooms.map((room) => {
              const isMaint = room.status === 'maintenance';
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => openBooking(room)}
                  className={`rounded-xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    isMaint
                      ? 'border-amber-200 bg-amber-50 opacity-80 dark:border-amber-900 dark:bg-amber-950/30'
                      : room.busy
                      ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                      : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{room.name}</p>
                  <p className="text-xs text-slate-500">{room.capacity} · {room.building}</p>
                  <p className={`mt-1 text-xs font-bold ${isMaint ? 'text-amber-700 dark:text-amber-400' : room.busy ? 'text-red-700' : 'text-green-700 dark:text-green-400'}`}>
                    {isMaint ? '🔧 ปิดปรับปรุงชั่วคราว' : room.busy ? '× มีการจองทับเวลา' : '✓ ว่าง พร้อมจอง'}
                  </p>
                  {room.busy && room.conflicts?.length > 0 && (
                    <p className="mt-1 text-[11px] leading-snug text-red-600 dark:text-red-400">
                      {room.conflicts.map((c) => `${formatTime(c.start)}–${formatTime(c.end)} (${c.bookerName})`).join(' · ')}
                    </p>
                  )}
                </button>
              );
            })

          )}
        </div>
      </Card>
      </div>

      <BookingModal
        open={Boolean(modalRoom)}
        onClose={() => setModalRoom(null)}
        room={modalRoom}
        draft={{ date: dateKey, period, start, end }}
        meta={meta}
        onSuccess={() => { loadAvailability(); loadDayBookings(); }}
      />
    </div>
  );
}
