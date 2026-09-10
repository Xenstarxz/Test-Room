import { Router } from 'express';
import { getDb, createAuditLog } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';

const router = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function escapeCSV(val) {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  return /[",\n\r]/.test(str) ? `"${str}"` : str;
}

function toCSV(headers, rows) {
  const head = headers.join(',');
  const body = rows.map((r) => headers.map((h) => escapeCSV(r[h])).join(','));
  return [head, ...body].join('\r\n');
}

function thaiDate(ts) {
  return ts ? new Date(ts).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '';
}

// ─── ADMIN AUDIT LOGS ───────────────────────────────────────────────────────

// GET /api/audit-logs
router.get('/', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json(
    logs.map((l) => ({
      id: l.id,
      adminId: l.admin_id,
      adminName: l.admin_name,
      action: l.action,
      details: l.details,
      target: l.target || null,
      createdAt: l.created_at,
    }))
  );
});

// GET /api/audit-logs/export.csv — ดาวน์โหลด admin logs เป็น CSV
router.get('/export.csv', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC').all();

  const headers = ['id', 'adminName', 'action', 'details', 'target', 'createdAt'];
  const rows = logs.map((l) => ({
    id: l.id,
    adminName: l.admin_name,
    action: l.action,
    details: l.details,
    target: l.target || '',
    createdAt: thaiDate(l.created_at),
  }));

  const csv = toCSV(headers, rows);
  const filename = `admin-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM สำหรับ Excel ไทย
  res.send('\uFEFF' + csv);
});

// DELETE /api/audit-logs — ลบ admin audit logs ทั้งหมด
router.delete('/', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
  db.prepare('DELETE FROM audit_logs').run();

  // บันทึก log ว่ามีคนล้าง log (ต้องเขียนหลังลบ ไม่งั้น log จะโดนลบไปด้วย)
  createAuditLog(db, {
    adminId: req.user.id,
    adminName: req.user.displayName || req.user.username,
    action: 'CLEAR_AUDIT_LOGS',
    details: `ล้าง Admin Audit Log ทั้งหมด ${count} รายการ`,
    target: `cleared:${count}`,
  });

  res.json({ message: `ล้าง Admin Audit Log เรียบร้อย (${count} รายการ)`, cleared: count });
});

// ─── USER ACTIVITY LOGS ─────────────────────────────────────────────────────

// GET /api/audit-logs/user-logs
router.get('/user-logs', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const userId = req.query.userId || null;

  let query = 'SELECT * FROM user_logs';
  const params = [];
  if (userId) {
    query += ' WHERE user_id = ?';
    params.push(userId);
  }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const logs = db.prepare(query).all(...params);
  res.json(
    logs.map((l) => ({
      id: l.id,
      userId: l.user_id,
      userName: l.user_name,
      action: l.action,
      details: l.details,
      meta: l.meta ? JSON.parse(l.meta) : null,
      createdAt: l.created_at,
    }))
  );
});

// GET /api/audit-logs/user-logs/export.csv — ดาวน์โหลด user logs เป็น CSV
router.get('/user-logs/export.csv', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM user_logs ORDER BY created_at DESC').all();

  const headers = ['id', 'userName', 'action', 'details', 'roomName', 'date', 'start', 'end', 'purpose', 'equipment', 'createdAt'];
  const rows = logs.map((l) => {
    const meta = l.meta ? JSON.parse(l.meta) : {};
    return {
      id: l.id,
      userName: l.user_name,
      action: l.action,
      details: l.details,
      roomName: meta.roomName || '',
      date: meta.date || '',
      start: meta.start != null ? `${meta.start}:00` : '',
      end: meta.end != null ? `${meta.end}:00` : '',
      purpose: (meta.purpose || []).join('; '),
      equipment: (meta.equipment || []).join('; '),
      createdAt: thaiDate(l.created_at),
    };
  });

  const csv = toCSV(headers, rows);
  const filename = `user-activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
});

// DELETE /api/audit-logs/user-logs — ล้าง user activity logs ทั้งหมด
router.delete('/user-logs', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM user_logs').get().c;
  db.prepare('DELETE FROM user_logs').run();

  createAuditLog(db, {
    adminId: req.user.id,
    adminName: req.user.displayName || req.user.username,
    action: 'CLEAR_USER_LOGS',
    details: `ล้าง User Activity Log ทั้งหมด ${count} รายการ`,
    target: `cleared:${count}`,
  });

  res.json({ message: `ล้าง User Activity Log เรียบร้อย (${count} รายการ)`, cleared: count });
});

export default router;
