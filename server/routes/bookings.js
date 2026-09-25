import { Router } from 'express';
import { getDb, parseBookingRow, createAuditLog, createUserLog } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { randomUUID } from 'crypto';
import { getAllSettings } from './settings.js';

import {
  isWithinAdvanceDays,
  findConflicts,
  addDaysToKey,
  parseBookingPayload,
} from '../utils/booking.js';
import { validateEquipmentStock, getEquipmentAvailability } from '../utils/equipment.js';

import { emitEvent, emitToUser } from '../utils/socket.js';

const router = Router();

function getAllActiveBookings(db) {
  const rows = db.prepare("SELECT * FROM bookings WHERE status != 'cancelled'").all();
  return rows.map(parseBookingRow);
}

function createNotification(db, { userId, bookingId, type, message }) {
  db.prepare(`
    INSERT INTO notifications (id, user_id, booking_id, type, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(randomUUID(), userId, bookingId, type, message, Date.now());

  emitToUser(userId, 'NOTIFICATION_NEW', { type, message, bookingId });
}

router.get('/', authRequired, (req, res) => {
  const db = getDb();
  let query = 'SELECT bookings.*, users.phone AS booker_phone, users.department AS booker_department FROM bookings LEFT JOIN users ON bookings.user_id = users.id WHERE 1=1';
  const params = [];

  const { roomId, date, status, userId, dateFrom, dateTo, mine } = req.query;

  if (mine === 'true') {
    query += ' AND bookings.user_id = ?';
    params.push(req.user.id);
  }
  if (roomId) { query += ' AND bookings.room_id = ?'; params.push(roomId); }
  if (date) { query += ' AND bookings.date = ?'; params.push(date); }
  if (status) { query += ' AND bookings.status = ?'; params.push(status); }
  if (userId && req.user.role === 'admin') { query += ' AND bookings.user_id = ?'; params.push(userId); }
  if (dateFrom) { query += ' AND bookings.date >= ?'; params.push(dateFrom); }
  if (dateTo) { query += ' AND bookings.date <= ?'; params.push(dateTo); }

  query += ' ORDER BY bookings.date ASC, bookings.start_time ASC, bookings.created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows.map((row) => ({
    ...parseBookingRow(row),
    bookerPhone: row.booker_phone || '',
    bookerDepartment: row.booker_department || '',
  })));
});

router.get('/check/conflicts', authRequired, (req, res) => {
  const { roomId, date, start, end } = req.query;
  if (!roomId || !date || !start || !end) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
  }
  const db = getDb();
  const active = getAllActiveBookings(db);
  const conflicts = findConflicts(active, {
    date,
    roomId,
    start: Number(start),
    end: Number(end),
  });
  res.json({ conflicts, available: conflicts.length === 0 });
});

// ตรวจสอบสต็อกอุปกรณ์คงเหลือตามช่วงเวลาจริง (Real-time Overlapping Inventory)
router.get('/equipment/availability', authRequired, (req, res) => {
  const { date, start, end, excludeBookingId } = req.query;
  if (!date || start == null || end == null) {
    return res.status(400).json({ error: 'กรุณาระบุ date, start, end' });
  }

  const db = getDb();
  const settings = getAllSettings(db);
  const active = getAllActiveBookings(db);
  const availability = getEquipmentAvailability(
    active,
    { date, start: Number(start), end: Number(end), ignoreBookingId: excludeBookingId || null },
    settings
  );

  res.json({ date, start: Number(start), end: Number(end), availability });
});

// รีเซ็ต/ล้างข้อมูลการจองทั้งหมดในระบบ (Admin Only) - ต้องอยู่ก่อน /:id
router.post('/reset', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;

  const resetAll = db.transaction(() => {
    db.prepare('DELETE FROM notifications').run();
    db.prepare('DELETE FROM bookings').run();
  });

  resetAll();

  createAuditLog(db, {
    adminId: req.user?.id || 'admin',
    adminName: req.user?.displayName || req.user?.username || 'ผู้ดูแลระบบ',
    action: 'RESET_BOOKINGS',
    details: `รีเซ็ต/ล้างข้อมูลการจองทั้งหมด ${count} รายการ — เล็งการแจ้งเตือนทั้งหมดถูกลบด้วย`,
    target: `total_deleted:${count}`,
  });

  emitEvent('BOOKINGS_UPDATED');
  res.json({ message: `ล้างข้อมูลการจองทั้งหมดจำนวน ${count} รายการเรียบร้อยแล้ว`, count });
});

// ต้องอยู่ก่อน /:id เพื่อกัน Express ดักคำว่า "recurring" เป็น param id
router.post('/recurring', authRequired, (req, res) => {
  const weekCount = Number(req.body?.weeks);
  if (!Number.isInteger(weekCount) || weekCount < 2 || weekCount > 12) {
    return res.status(400).json({ error: 'จำนวนสัปดาห์ต้องอยู่ระหว่าง 2-12' });
  }

  const parsed = parseBookingPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const {
    roomId, date, period, start, end,
    purpose, years, subjects, equipment, otherPurpose, otherEquipment,
  } = parsed.data;

  const db = getDb();
  const settings = getAllSettings(db);
  if (settings.allow_bookings === false) {
    return res.status(400).json({ error: settings.maintenance_notice || 'ระบบปิดให้บริการจองห้องชั่วคราว ไม่สามารถทำการจองได้ในขณะนี้' });
  }

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return res.status(404).json({ error: 'ไม่พบห้อง' });
  if (room.status === 'maintenance') {
    return res.status(400).json({ error: 'ห้องนี้ปิดปรับปรุงชั่วคราว ไม่สามารถจองได้' });
  }
  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);

  const seriesId = randomUUID();

  const insertOne = db.transaction((targetDate) => {
    if (settings.advance_booking_days && !isWithinAdvanceDays(targetDate, settings.advance_booking_days)) {
      const err = new Error('advance_limit');
      err.conflicts = [{ start: 7, end: 20, bookerName: `เกินกำหนดจองล่วงหน้า (สูงสุด ${settings.advance_booking_days} วัน)`, status: 'maintenance' }];
      throw err;
    }
    if (settings.blackout_dates && settings.blackout_dates.includes(targetDate)) {
      const err = new Error('blackout');
      err.conflicts = [{ start: 7, end: 20, bookerName: 'วันปิดงดให้บริการ', status: 'maintenance' }];
      throw err;
    }
    const active = getAllActiveBookings(db);
    const conflicts = findConflicts(active, { date: targetDate, roomId, start, end });
    if (conflicts.length) {
      const err = new Error('conflict');
      err.conflicts = conflicts;
      throw err;
    }

    const stockErr = validateEquipmentStock(equipment, active, { date: targetDate, start, end }, settings);
    if (stockErr) {
      const err = new Error('equipment_stock');
      err.conflicts = [{ start, end, bookerName: stockErr.error, status: 'maintenance' }];
      throw err;
    }
    const now = Date.now();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO bookings (
        id, room_id, room_name, date, start_time, end_time, period,
        user_id, booker_name, purpose, years, subjects, equipment,
        other_purpose, other_equipment, status, created_at, updated_at, series_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, room.id, room.name, targetDate, start, end, period,
      req.user.id, user.display_name,
      JSON.stringify(purpose), JSON.stringify(years), JSON.stringify(subjects), JSON.stringify(equipment),
      otherPurpose?.trim() || null, otherEquipment?.trim() || null,
      'pending', now, now, seriesId
    );
    return id;
  });

  const created = [];
  const skipped = [];

  for (let i = 0; i < weekCount; i += 1) {
    const targetDate = addDaysToKey(date, i * 7);
    try {
      const id = insertOne(targetDate);
      created.push(parseBookingRow(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)));
    } catch (err) {
      skipped.push({ date: targetDate, conflicts: err.conflicts || [] });
    }
  }

  emitEvent('BOOKINGS_UPDATED');

  // User Log: จองซ้ำทุกสับดาห์
  if (created.length) {
    const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
    createUserLog(db, {
      userId: req.user.id,
      userName: user?.display_name || req.user.username,
      action: 'BOOK_RECURRING',
      details: `จองซ้ำทุกสับดาห์สำเร็จ ${created.length} ครั้ง (ข้าม ${skipped.length} ครั้ง) | ห้อง: ${room.name} | วันเริ่ม: ${date} | ${start}:00–${end}:00`,
      meta: { roomId: room.id, roomName: room.name, date, start, end, period, purpose, created: created.length, skipped: skipped.length, seriesId },
    });
  }

  res.status(created.length ? 201 : 409).json({ created, skipped, seriesId });
});

// ยกเลิกการจองซ้ำทั้งชุด (series) - เฉพาะเจ้าของหรือ Admin
router.post('/series/:seriesId/cancel', authRequired, (req, res) => {
  const db = getDb();
  const seriesId = req.params.seriesId;
  const rows = db.prepare('SELECT * FROM bookings WHERE series_id = ?').all(seriesId);
  if (!rows.length) {
    return res.status(404).json({ error: 'ไม่พบชุดการจองนี้' });
  }

  const isOwnerOrAdmin = rows.every((r) => r.user_id === req.user.id) || req.user.role === 'admin';
  if (!isOwnerOrAdmin) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกชุดการจองนี้' });
  }

  const { reason } = req.body || {};
  const now = Date.now();
  const activeSeriesRows = rows.filter((r) => r.status !== 'cancelled');

  if (activeSeriesRows.length === 0) {
    return res.status(400).json({ error: 'ทุกรายการในชุดนี้ถูกยกเลิกไปแล้ว' });
  }

  const cancelReason = reason?.trim() || (req.user.role === 'admin' ? 'ยกเลิกชุดการจองโดยผู้ดูแลระบบ' : 'ยกเลิกทั้งชุดการจองซ้ำ');
  db.prepare("UPDATE bookings SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE series_id = ? AND status != 'cancelled'")
    .run(cancelReason, now, seriesId);

  // แจ้งเตือนเจ้าของรายการ (in-app notification)
  const firstRow = activeSeriesRows[0];
  const uniqueOwnerIds = [...new Set(activeSeriesRows.map((r) => r.user_id))];
  const roomName = firstRow?.room_name || 'ห้อง';
  const noticeMsg = req.user.role === 'admin' && req.user.id !== firstRow?.user_id
    ? `ชุดการจองซ้ำ ${roomName} ทั้งหมด ${activeSeriesRows.length} รายการ ถูกยกเลิกโดยผู้ดูแลระบบ เหตุผล: ${cancelReason}`
    : `คุณได้ยกเลิกชุดการจองซ้ำ ${roomName} จำนวน ${activeSeriesRows.length} รายการเรียบร้อยแล้ว`;

  for (const ownerId of uniqueOwnerIds) {
    createNotification(db, {
      userId: ownerId,
      bookingId: firstRow?.id || null,
      type: 'booking_cancelled',
      message: noticeMsg,
    });
  }

  if (req.user.role === 'admin') {
    createAuditLog(db, {
      adminId: req.user.id,
      adminName: req.user.displayName || req.user.username,
      action: 'CANCEL_SERIES',
      details: `ยกเลิกชุดการจองซ้ำ (${activeSeriesRows.length} รายการ) | ห้อง: ${roomName} | เหตุผล: ${cancelReason}`,
      target: `series:${seriesId}`,
    });
  }

  emitEvent('BOOKINGS_UPDATED');
  res.json({ message: `ยกเลิกการจองซ้ำทั้งชุดเรียบร้อยแล้ว (${activeSeriesRows.length} รายการ)`, count: activeSeriesRows.length });
});

router.get('/:id', authRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบรายการจอง' });
  const booking = parseBookingRow(row);
  if (booking.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  res.json(booking);
});

router.post('/', authRequired, (req, res) => {
  const parsed = parseBookingPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const {
    roomId, date, period, start, end,
    purpose, years, subjects, equipment, otherPurpose, otherEquipment,
  } = parsed.data;

  const db = getDb();
  const settings = getAllSettings(db);

  if (settings.allow_bookings === false) {
    return res.status(400).json({ error: settings.maintenance_notice || 'ระบบปิดให้บริการจองห้องชั่วคราว ไม่สามารถทำการจองได้ในขณะนี้' });
  }

  if (settings.advance_booking_days && !isWithinAdvanceDays(date, settings.advance_booking_days)) {
    return res.status(400).json({ error: `ไม่สามารถจองล่วงหน้าเกิน ${settings.advance_booking_days} วันได้` });
  }

  if (settings.blackout_dates && settings.blackout_dates.includes(date)) {
    return res.status(400).json({ error: `วันที่ ${date} เป็นวันปิดงดให้บริการ/วันหยุดตามที่แอดมินกำหนด ไม่สามารถทำการจองได้` });
  }

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return res.status(404).json({ error: 'ไม่พบห้อง' });
  if (room.status === 'maintenance') {
    return res.status(400).json({ error: 'ห้องนี้ปิดปรับปรุงชั่วคราว ไม่สามารถจองได้' });
  }

  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);

  const createBooking = db.transaction(() => {
    const active = getAllActiveBookings(db);
    const conflicts = findConflicts(active, { date, roomId, start, end });
    if (conflicts.length) {
      const err = new Error('ห้องถูกจองในช่วงเวลานี้แล้ว');
      err.status = 409;
      err.conflicts = conflicts;
      throw err;
    }

    const stockErr = validateEquipmentStock(equipment, active, { date, start, end }, settings);
    if (stockErr) {
      const err = new Error(stockErr.error);
      err.status = 409;
      err.conflicts = [{ start, end, bookerName: stockErr.error, status: 'maintenance' }];
      throw err;
    }

    const now = Date.now();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO bookings (
        id, room_id, room_name, date, start_time, end_time, period,
        user_id, booker_name, purpose, years, subjects, equipment,
        other_purpose, other_equipment, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, room.id, room.name, date, start, end, period,
      req.user.id, user.display_name,
      JSON.stringify(purpose), JSON.stringify(years), JSON.stringify(subjects), JSON.stringify(equipment),
      otherPurpose?.trim() || null, otherEquipment?.trim() || null,
      'pending', now, now
    );

    return id;
  });

  let bookingId;
  try {
    bookingId = createBooking();
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message, conflicts: err.conflicts });
    }
    throw err;
  }

  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  emitEvent('BOOKINGS_UPDATED');

  // User Log: สร้างการจองใหม่
  const bookerInfo = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
  createUserLog(db, {
    userId: req.user.id,
    userName: bookerInfo?.display_name || req.user.username,
    action: 'BOOK_ROOM',
    details: `จองห้อง: ${room.name} | วัน: ${date} | เวลา: ${start}:00–${end}:00 | วัตถุประสงค์: ${purpose.join(', ') || '-'} | อุปกรณ์: ${equipment.join(', ') || 'ไม่มี'}`,
    meta: { bookingId, roomId: room.id, roomName: room.name, date, start, end, period, purpose, years, subjects, equipment, otherPurpose, otherEquipment },
  });

  res.status(201).json(parseBookingRow(row));
});

router.patch('/:id', authRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบรายการจอง' });
  if (row.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไข' });
  }
  if (row.status === 'cancelled') {
    return res.status(400).json({ error: 'ไม่สามารถแก้ไขรายการที่ถูกยกเลิกแล้ว' });
  }

  const parsed = parseBookingPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const {
    roomId, date, period, start, end,
    purpose, years, subjects, equipment, otherPurpose, otherEquipment,
  } = parsed.data;

  const settings = getAllSettings(db);
  if (settings.allow_bookings === false) {
    return res.status(400).json({ error: settings.maintenance_notice || 'ระบบปิดให้บริการจองห้องชั่วคราว ไม่สามารถทำการจองได้ในขณะนี้' });
  }

  if (settings.advance_booking_days && !isWithinAdvanceDays(date, settings.advance_booking_days)) {
    return res.status(400).json({ error: `ไม่สามารถจองล่วงหน้าเกิน ${settings.advance_booking_days} วันได้` });
  }

  if (settings.blackout_dates && settings.blackout_dates.includes(date)) {
    return res.status(400).json({ error: `วันที่ ${date} เป็นวันปิดงดให้บริการ/วันหยุดตามที่แอดมินกำหนด ไม่สามารถทำการจองได้` });
  }

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return res.status(404).json({ error: 'ไม่พบห้อง' });
  if (room.status === 'maintenance') {
    return res.status(400).json({ error: 'ห้องนี้ปิดปรับปรุงชั่วคราว ไม่สามารถจองได้' });
  }

  const runUpdate = db.transaction(() => {
    const active = getAllActiveBookings(db);
    const conflicts = findConflicts(active, { date, roomId, start, end, ignoreBookingId: row.id });
    if (conflicts.length) {
      const err = new Error('ห้องถูกจองในช่วงเวลานี้แล้ว');
      err.status = 409;
      err.conflicts = conflicts;
      throw err;
    }

    const stockErr = validateEquipmentStock(equipment, active, { date, start, end, ignoreBookingId: row.id }, settings);
    if (stockErr) {
      const err = new Error(stockErr.error);
      err.status = 409;
      err.conflicts = [{ start, end, bookerName: stockErr.error, status: 'maintenance' }];
      throw err;
    }

    const nextStatus = row.status === 'confirmed' ? 'pending' : row.status;
    db.prepare(`
      UPDATE bookings SET
        room_id = ?, room_name = ?, date = ?, start_time = ?, end_time = ?, period = ?,
        purpose = ?, years = ?, subjects = ?, equipment = ?, other_purpose = ?, other_equipment = ?,
        status = ?, cancel_reason = NULL, updated_at = ?
      WHERE id = ?
    `).run(
      room.id, room.name, date, start, end, period,
      JSON.stringify(purpose), JSON.stringify(years), JSON.stringify(subjects), JSON.stringify(equipment),
      otherPurpose?.trim() || null, otherEquipment?.trim() || null,
      nextStatus, Date.now(), row.id
    );

    if (nextStatus !== row.status) {
      createNotification(db, {
        userId: row.user_id,
        bookingId: row.id,
        type: 'booking_updated',
        message: `แก้ไขการจอง ${room.name} วันที่ ${date} แล้ว รอผู้ดูแลระบบยืนยันอีกครั้ง`,
      });
    }
  });

  try {
    runUpdate();
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ error: err.message, conflicts: err.conflicts });
    throw err;
  }

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(row.id);
  emitEvent('BOOKINGS_UPDATED');

  // User Log: แก้ไขการจอง
  const editorInfo = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
  createUserLog(db, {
    userId: req.user.id,
    userName: editorInfo?.display_name || req.user.username,
    action: 'EDIT_BOOKING',
    details: `แก้ไขการจอง | ห้อง: ${room.name} | วัน: ${date} | เวลา: ${start}:00–${end}:00 | วัตถุประสงค์: ${purpose.join(', ') || '-'} | ID: ${row.id.slice(0, 8)}`,
    meta: { bookingId: row.id, roomId: room.id, roomName: room.name, date, start, end, period, purpose, equipment },
  });

  res.json(parseBookingRow(updated));
});

router.patch('/:id/status', authRequired, adminRequired, (req, res) => {
  const { status, reason } = req.body || {};
  if (!['confirmed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  }
  if (status === 'cancelled' && !reason?.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุเหตุผลในการยกเลิก/ปฏิเสธ' });
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบรายการจอง' });

  const trimmedReason = status === 'cancelled' ? reason.trim() : null;
  db.prepare('UPDATE bookings SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ?')
    .run(status, trimmedReason, Date.now(), req.params.id);

  const message = status === 'confirmed'
    ? `การจอง ${row.room_name} วันที่ ${row.date} เวลา ${row.start_time}-${row.end_time} ได้รับการยืนยันแล้ว`
    : `การจอง ${row.room_name} วันที่ ${row.date} ถูกยกเลิกโดยผู้ดูแลระบบ เหตุผล: ${trimmedReason}`;
  createNotification(db, {
    userId: row.user_id,
    bookingId: row.id,
    type: status === 'confirmed' ? 'booking_confirmed' : 'booking_cancelled',
    message,
  });

  createAuditLog(db, {
    adminId: req.user.id,
    adminName: req.user.displayName || req.user.username,
    action: status === 'confirmed' ? 'CONFIRM_BOOKING' : 'CANCEL_BOOKING',
    details: status === 'confirmed'
      ? `ยืนยันการจอง | ห้อง: ${row.room_name} | วัน: ${row.date} | เวลา: ${row.start_time}:00–${row.end_time}:00 | ผู้จอง: ${row.booker_name}`
      : `ยกเลิก/ปฏิเสธการจอง | ห้อง: ${row.room_name} | วัน: ${row.date} | เวลา: ${row.start_time}:00–${row.end_time}:00 | ผู้จอง: ${row.booker_name} | เหตุผล: ${trimmedReason}`,
    target: `booking:${row.id} user:${row.user_id}`,
  });

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);

  emitEvent('BOOKINGS_UPDATED');
  res.json(parseBookingRow(updated));
});

router.post('/:id/cancel', authRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบรายการจอง' });
  if (row.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิก' });
  }
  if (row.status === 'cancelled') {
    return res.status(400).json({ error: 'รายการนี้ถูกยกเลิกแล้ว' });
  }

  db.prepare("UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE id = ?").run(Date.now(), req.params.id);
  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  emitEvent('BOOKINGS_UPDATED');

  // User Log: ยกเลิกการจองด้วยตนเอง
  const cancellerInfo = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
  createUserLog(db, {
    userId: req.user.id,
    userName: cancellerInfo?.display_name || req.user.username,
    action: 'CANCEL_BOOKING',
    details: `ยกเลิกการจอง | ห้อง: ${row.room_name} | วัน: ${row.date} | เวลา: ${row.start_time}:00–${row.end_time}:00 | ID: ${row.id.slice(0, 8)}`,
    meta: { bookingId: row.id, roomName: row.room_name, date: row.date, start: row.start_time, end: row.end_time },
  });

  res.json(parseBookingRow(updated));
});

export default router;
