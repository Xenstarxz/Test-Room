import { TIME_WINDOWS } from '../data/constants.js';

export function periodWindow(period) {
  return TIME_WINDOWS[period] || TIME_WINDOWS.morning;
}

export function validateInterval({ period, start, end }) {
  const window = periodWindow(period);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'กรุณาเลือกเวลาให้ครบ';
  if (start < window.start || end > window.end) {
    return `ต้องเลือกเวลาใน${window.label} (${formatTime(window.start)}–${formatTime(window.end)})`;
  }
  if (end <= start) return 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น';
  if (end - start > 8) return 'จองได้สูงสุด 8 ชั่วโมง';
  if (Math.round(start * 2) !== start * 2 || Math.round(end * 2) !== end * 2) {
    return 'เลือกเวลาได้ครั้งละ 30 นาที';
  }
  return '';
}

export function formatTime(value) {
  const rounded = Math.round(Number(value) * 2) / 2;
  if (!Number.isFinite(rounded)) return '-';
  const hour = Math.floor(rounded);
  const minute = Math.round((rounded - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

export function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isFutureOrToday(key) {
  return isDateKey(key) && key >= todayKey();
}

export function isWithinAdvanceDays(key, advanceDays = 90) {
  if (!isDateKey(key)) return false;
  const maxKey = addDaysToKey(todayKey(), Number(advanceDays) || 90);
  return key <= maxKey;
}

export function findConflicts(bookings, { date, roomId, start, end, ignoreBookingId = null }) {
  return bookings.filter(
    (b) =>
      b.id !== ignoreBookingId &&
      b.status !== 'cancelled' &&
      b.date === date &&
      b.roomId === roomId &&
      start < b.end &&
      end > b.start
  );
}

export function addDaysToKey(dateKey, days) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function conflictSummary(conflicts) {
  return conflicts
    .map((c) => `${formatTime(c.start)}–${formatTime(c.end)} (โดย ${c.bookerName})`)
    .join(', ');
}

// รวม validation ของ payload การจอง ใช้ร่วมกันทั้งสร้างใหม่ / แก้ไข / จองซ้ำรายสัปดาห์
// เพื่อไม่ให้กฎ business logic เพี้ยนกันระหว่าง endpoint
export function parseBookingPayload(body) {
  const {
    roomId, date, period,
    purpose = [], years = [], subjects = [], equipment = [],
    otherPurpose = '', otherEquipment = '',
  } = body || {};
  let { start, end } = body || {};

  if (!roomId || !date || !period) {
    return { error: 'ข้อมูลไม่ครบ' };
  }
  if (!isFutureOrToday(date)) {
    return { error: 'กรุณาเลือกวันที่ตั้งแต่วันนี้เป็นต้นไป' };
  }
  if (!Array.isArray(purpose) || purpose.length === 0) {
    return { error: 'กรุณาเลือกวัตถุประสงค์อย่างน้อย 1 รายการ' };
  }
  if (purpose.includes('อื่นๆ') && !otherPurpose?.trim()) {
    return { error: 'กรุณาระบุวัตถุประสงค์อื่น' };
  }

  if (period === 'fullday') {
    start = TIME_WINDOWS.fullday.start;
    end = TIME_WINDOWS.fullday.end;
  }

  const intervalError = validateInterval({ period, start, end });
  if (intervalError) return { error: intervalError };

  return {
    data: { roomId, date, period, start, end, purpose, years, subjects, equipment, otherPurpose, otherEquipment },
  };
}
