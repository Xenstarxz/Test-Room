import { Router } from 'express';
import { getDb, createAuditLog } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { SUBJECTS, EQUIPMENT, TIME_WINDOWS } from '../data/constants.js';
import { emitEvent } from '../utils/socket.js';

const router = Router();

// Helper ดึง settings ทั้งหมด แปลงค่าให้อยู่ในรูปที่พร้อมใช้งาน
export function getAllSettings(db) {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {
    advance_booking_days: 90,
    blackout_dates: [],
    subjects: SUBJECTS,
    equipment: EQUIPMENT,
    equipment_limits: {
      'ไมค์': { min: 0, max: 4, unit: 'ตัว', icon: '🎤' },
      'ไมค์เคลื่อนที่': { min: 0, max: 2, unit: 'ตัว', icon: '🎙️' },
      'พอยเตอร์': { min: 0, max: 2, unit: 'อัน', icon: '🎯' },
      'สาย HDMI': { min: 0, max: 3, unit: 'เส้น', icon: '🔌' },
      'สายแปลง Type-C': { min: 0, max: 3, unit: 'เส้น', icon: '🔄' },
    },
    equipment_stock: {
      'ไมค์': 4,
      'ไมค์เคลื่อนที่': 2,
      'พอยเตอร์': 2,
      'สาย HDMI': 3,
      'สายแปลง Type-C': 3,
    },
    time_windows: TIME_WINDOWS,
    site_title: 'ระบบจองห้องเรียนและห้องประชุม',
    contact_info: 'หากพบปัญหาการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
    allow_registration: true,
    require_approval: true,
    allow_bookings: true,
    maintenance_notice: 'ขณะนี้ระบบปิดให้บริการจองห้องชั่วคราว ขออภัยในความไม่สะดวก',
  };

  for (const r of rows) {
    try {
      if (r.key === 'advance_booking_days') {
        settings[r.key] = Number(r.value) || 90;
      } else if (r.key === 'allow_registration' || r.key === 'require_approval' || r.key === 'allow_bookings') {
        settings[r.key] = r.value === 'true' || r.value === '1';
      } else if (['blackout_dates', 'subjects', 'equipment', 'equipment_limits', 'equipment_stock', 'time_windows'].includes(r.key)) {
        settings[r.key] = JSON.parse(r.value);
      } else {
        settings[r.key] = r.value;
      }
    } catch {
      // fallback
    }
  }

  return settings;
}

// GET /api/settings - ผู้ใช้ทุกคนที่ล็อกอินสามารถอ่านค่าได้
router.get('/', authRequired, (_req, res) => {
  const db = getDb();
  res.json(getAllSettings(db));
});

// PUT /api/settings - เฉพาะแอดมินเท่านั้นที่ปรับได้
router.put('/', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  const {
    advanceBookingDays,
    blackoutDates,
    subjects,
    equipment,
    equipmentLimits,
    equipmentStock,
    timeWindows,
    siteTitle,
    contactInfo,
    allowRegistration,
    requireApproval,
    allowBookings,
    maintenanceNotice,
  } = req.body || {};

  const tx = db.transaction(() => {
    if (advanceBookingDays !== undefined) {
      const days = Math.max(1, Math.min(365, Number(advanceBookingDays) || 90));
      upsert.run('advance_booking_days', String(days), now);
    }

    if (Array.isArray(blackoutDates)) {
      upsert.run('blackout_dates', JSON.stringify(blackoutDates), now);
    }

    if (subjects && typeof subjects === 'object') {
      upsert.run('subjects', JSON.stringify(subjects), now);
    }

    if (Array.isArray(equipment)) {
      upsert.run('equipment', JSON.stringify(equipment.filter(Boolean)), now);
    }

    if (equipmentLimits && typeof equipmentLimits === 'object' && !Array.isArray(equipmentLimits)) {
      upsert.run('equipment_limits', JSON.stringify(equipmentLimits), now);
    }

    if (equipmentStock && typeof equipmentStock === 'object' && !Array.isArray(equipmentStock)) {
      upsert.run('equipment_stock', JSON.stringify(equipmentStock), now);
    }

    if (timeWindows && typeof timeWindows === 'object') {
      upsert.run('time_windows', JSON.stringify(timeWindows), now);
    }

    if (typeof siteTitle === 'string') {
      upsert.run('site_title', siteTitle.trim(), now);
    }

    if (typeof contactInfo === 'string') {
      upsert.run('contact_info', contactInfo.trim(), now);
    }

    if (allowRegistration !== undefined) {
      upsert.run('allow_registration', String(Boolean(allowRegistration)), now);
    }

    if (requireApproval !== undefined) {
      upsert.run('require_approval', String(Boolean(requireApproval)), now);
    }

    if (allowBookings !== undefined) {
      upsert.run('allow_bookings', String(Boolean(allowBookings)), now);
    }

    if (typeof maintenanceNotice === 'string') {
      upsert.run('maintenance_notice', maintenanceNotice.trim(), now);
    }

    createAuditLog(db, {
      adminId: req.user.id,
      adminName: req.user.displayName || req.user.username,
      action: 'UPDATE_SETTINGS',
      details: 'อัปเดตการตั้งค่าระบบและกฎเกณฑ์ของเว็บผ่านแผงควบคุม',
    });
  });

  tx();

  emitEvent('SETTINGS_UPDATED');
  res.json(getAllSettings(db));
});

export default router;
