import { Router } from 'express';
import { getDb, parseBookingRow } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { formatTime } from '../utils/booking.js';

const router = Router();

router.get('/', authRequired, (req, res) => {
  const { mode = 'month', month } = req.query;
  const db = getDb();
  let bookings = db.prepare("SELECT * FROM bookings WHERE status != 'cancelled'").all().map(parseBookingRow);

  if (mode === 'month' && month) {
    bookings = bookings.filter((b) => b.date.startsWith(month));
  } else if (mode === 'year' && month) {
    bookings = bookings.filter((b) => b.date.startsWith(month.slice(0, 4)));
  }

  const roomCounts = new Map();
  const slotCounts = new Map();

  bookings.forEach((b) => {
    roomCounts.set(b.roomName, (roomCounts.get(b.roomName) || 0) + 1);
    const label = `${formatTime(b.start)}–${formatTime(b.end)}`;
    slotCounts.set(label, (slotCounts.get(label) || 0) + 1);
  });

  const topRooms = [...roomCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
  const topSlots = [...slotCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const maxRoom = topRooms[0]?.[1] || 1;
  const maxSlot = topSlots[0]?.[1] || 1;

  res.json({
    total: bookings.length,
    topRoom: topRooms[0] ? { name: topRooms[0][0], count: topRooms[0][1] } : null,
    topSlot: topSlots[0]
      ? { label: topSlots[0][0], count: topSlots[0][1] }
      : null,
    rooms: topRooms.map(([name, count]) => ({ name, count, percent: (count / maxRoom) * 100 })),
    slots: topSlots.slice(0, 8).map(([label, count]) => ({
      label,
      count,
      percent: (count / maxSlot) * 100,
    })),
  });
});

router.get('/dashboard', authRequired, (req, res) => {
  const db = getDb();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const todayBookings = db.prepare(
    "SELECT * FROM bookings WHERE date = ? AND status != 'cancelled' ORDER BY start_time"
  ).all(todayKey).map(parseBookingRow);

  const myBookings = db.prepare(
    "SELECT * FROM bookings WHERE user_id = ? AND status != 'cancelled' AND date >= ? ORDER BY date, start_time LIMIT 5"
  ).all(req.user.id, todayKey).map(parseBookingRow);

  let adminStats = null;
  if (req.user.role === 'admin') {
    adminStats = {
      pendingUsers: db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ? AND approved = 0').get('user').c,
      pendingBookings: db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'pending'").get().c,
    };
  }

  res.json({ todayBookings, myBookings, adminStats });
});

function sanitizeCsvField(value) {
  const str = String(value ?? '');
  return /^[=+\-@]/.test(str) ? `'${str}` : str;
}

router.get('/export', authRequired, adminRequired, (req, res) => {
  const { dateFrom, dateTo, roomId } = req.query;
  const db = getDb();
  let query = "SELECT * FROM bookings WHERE status != 'cancelled'";
  const params = [];
  if (dateFrom) { query += ' AND date >= ?'; params.push(dateFrom); }
  if (dateTo) { query += ' AND date <= ?'; params.push(dateTo); }
  if (roomId) { query += ' AND room_id = ?'; params.push(roomId); }
  query += ' ORDER BY date, start_time';

  const rows = db.prepare(query).all(...params).map(parseBookingRow);

  const header = ['ห้อง', 'วันที่', 'เริ่ม', 'สิ้นสุด', 'ผู้จอง', 'วัตถุประสงค์', 'สถานะ'];
  const csvRows = rows.map((b) => [
    sanitizeCsvField(b.roomName),
    sanitizeCsvField(b.date),
    sanitizeCsvField(formatTime(b.start)),
    sanitizeCsvField(formatTime(b.end)),
    sanitizeCsvField(b.bookerName),
    sanitizeCsvField([...b.purpose, ...(b.subjects || [])].join('; ')),
    sanitizeCsvField(b.status),
  ]);

  const bom = '\uFEFF';
  const csv = bom + [header, ...csvRows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=bookings.csv');
  res.send(csv);
});

export default router;