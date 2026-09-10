import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Input.jsx';
import { EmptyState } from '../components/ui/Badge.jsx';
import { addDaysToKey, startOfWeekKey, formatThaiDate, formatTime, THAI_WEEKDAYS_SHORT, todayKey } from '../utils/date.js';
import { useSocket } from '../context/SocketContext.jsx';
import BookingModal from '../components/booking/BookingModal.jsx';

export default function WeekViewPage() {
  const { subscribe } = useSocket();
  const [weekStart, setWeekStart] = useState(() => startOfWeekKey(new Date()));
  const [roomFilter, setRoomFilter] = useState('');
  const [rooms, setRooms] = useState([]);
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchWeekData = useCallback(() => {
    setLoading(true);
    const params = { startDate: weekStart };
    if (roomFilter) params.roomId = roomFilter;
    api.getWeekAvailability(params).then(setData).finally(() => setLoading(false));
  }, [weekStart, roomFilter]);

  useEffect(() => {
    api.getRooms().then(setRooms);
    api.getRoomMeta().then(setMeta);
  }, []);

  useEffect(() => {
    fetchWeekData();
  }, [fetchWeekData]);

  // Real-time WebSockets: อัปเดตข้อมูลตารางรายสัปดาห์ทันทีเมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    const unsub1 = subscribe('BOOKINGS_UPDATED', () => fetchWeekData());
    const unsub2 = subscribe('ROOMS_UPDATED', () => {
      api.getRooms().then(setRooms);
      fetchWeekData();
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [subscribe, fetchWeekData]);

  const today = todayKey();
  const isCurrentWeek = weekStart === startOfWeekKey(new Date());

  const goWeek = (dir) => setWeekStart((w) => addDaysToKey(w, dir * 7));

  const rangeLabel = useMemo(() => {
    if (!data) return '';
    return `${formatThaiDate(data.days[0])} – ${formatThaiDate(data.days[6])}`;
  }, [data]);

  const handleCellClick = (room, dateKey) => {
    if (room.status === 'maintenance') return;
    if (dateKey < today) return; // ไม่อนุญาตให้จองวันที่ผ่านมาแล้ว
    setModalData({
      room: { id: room.id, name: room.name, capacity: room.capacity, building: room.building, status: room.status },
      date: dateKey,
    });
  };

  return (
    <Card title="ห้องว่างรายสัปดาห์" icon="🗓️" note="คลิกช่องวันที่ต้องการเพื่อจองห้องทันที (เฉพาะวันปัจจุบันและอนาคต)">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => goWeek(-1)} aria-label="สัปดาห์ก่อนหน้า">‹</Button>
          <span className="min-w-[180px] text-center text-sm font-bold text-slate-700 dark:text-slate-200">{rangeLabel}</span>
          <Button variant="outline" size="sm" onClick={() => goWeek(1)} aria-label="สัปดาห์ถัดไป">›</Button>
        </div>
        {!isCurrentWeek && (
          <Button variant="neutral" size="sm" onClick={() => setWeekStart(startOfWeekKey(new Date()))}>สัปดาห์นี้</Button>
        )}
        <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="!min-h-9 max-w-[220px]">
          <option value="">ทุกห้อง</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </div>

      {loading || !data ? (
        <EmptyState>กำลังโหลด...</EmptyState>
      ) : data.rooms.length === 0 ? (
        <EmptyState>ไม่พบห้อง</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[160px] bg-white p-2 text-left font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">ห้อง</th>
                {data.days.map((date, i) => (
                  <th
                    key={date}
                    className={`min-w-[130px] p-2 text-center font-bold ${
                      date === today ? 'text-brand-600 dark:text-brand-400 font-extrabold' : date < today ? 'text-slate-400 opacity-60' : 'text-slate-500'
                    }`}
                  >
                    <div>{THAI_WEEKDAYS_SHORT[i]}</div>
                    <div className="text-[10px] font-normal">{formatThaiDate(date).split(' ').slice(0, 2).join(' ')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((room) => (
                <tr key={room.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="sticky left-0 z-10 bg-white p-2 align-top dark:bg-slate-900">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{room.name}</p>
                    <p className="text-[10px] text-slate-400">{room.capacity} · {room.building}</p>
                  </td>
                  {room.days.map((day) => {
                    const isPast = day.date < today;
                    return (
                      <td
                        key={day.date}
                        onClick={() => !isPast && handleCellClick(room, day.date)}
                        className={`p-1.5 align-top transition-all ${
                          isPast
                            ? 'bg-slate-100/60 dark:bg-slate-800/30 opacity-60 cursor-not-allowed'
                            : 'cursor-pointer hover:bg-brand-50/60 dark:hover:bg-slate-800/60'
                        } ${day.date === today ? 'bg-brand-50/40 dark:bg-brand-950/20' : ''}`}
                      >
                        {isPast ? (
                          day.bookings.length === 0 ? (
                            <span className="block rounded-lg bg-slate-200/60 dark:bg-slate-800/80 px-2 py-1 text-center text-[10px] font-medium text-slate-400 dark:text-slate-500">
                              - ผ่านไปแล้ว
                            </span>
                          ) : (
                            <div className="grid gap-1 opacity-75">
                              {day.bookings.map((b, idx) => (
                                <span
                                  key={idx}
                                  className="block rounded-lg border border-slate-300 bg-slate-200/80 px-2 py-1 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                  title={`${b.bookerName}`}
                                >
                                  {formatTime(b.start)}–{formatTime(b.end)} {b.bookerName ? `· ${b.bookerName}` : ''}
                                </span>
                              ))}
                            </div>
                          )
                        ) : day.bookings.length === 0 ? (
                          <span className="block rounded-lg bg-green-50 hover:bg-green-100 px-2 py-1 text-center text-[10px] font-bold text-green-700 dark:bg-green-950/30 dark:text-green-400">
                            + ว่าง (คลิกจอง)
                          </span>
                        ) : (
                          <div className="grid gap-1">
                            {day.bookings.map((b, idx) => (
                              <span
                                key={idx}
                                className="block rounded-lg border border-red-200 bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
                                title={`${b.bookerName} (${b.purpose?.join(', ') || 'จองแล้ว'})`}
                              >
                                {formatTime(b.start)}–{formatTime(b.end)} {b.bookerName ? `· ${b.bookerName}` : ''}
                              </span>
                            ))}
                            <span className="block rounded text-center text-[9px] font-bold text-brand-600 dark:text-brand-400 opacity-70 hover:opacity-100">
                              + จองช่วงเวลาอื่น
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalData && meta && (
        <BookingModal
          open={Boolean(modalData)}
          onClose={() => setModalData(null)}
          room={modalData.room}
          draft={{ date: modalData.date, period: 'morning', start: 7, end: 8 }}
          meta={meta}
          onSuccess={fetchWeekData}
        />
      )}
    </Card>
  );
}
