import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, createAuditLog } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { emitEvent } from '../utils/socket.js';

const router = Router();

router.get('/', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  // ดึงผู้ใช้งานทั้งหมด เพื่อให้ Admin สามารถดูและจัดการยศ/สิทธิ์ของผู้ใช้ทุกคนได้
  const users = db.prepare('SELECT id, username, display_name, role, approved, created_at FROM users ORDER BY approved ASC, created_at ASC').all();
  res.json(users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role || 'user',
    approved: Boolean(u.approved),
    createdAt: u.created_at,
  })));
});

// ต้องอยู่ก่อน /:id เพื่อกัน Express ดักเป็น param
router.get('/pending-count', authRequired, adminRequired, (_req, res) => {
  const db = getDb();
  const pendingUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE approved = 0').get().c;
  const pendingBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'pending'").get().c;
  res.json({ pendingUsers, pendingBookings });
});

router.patch('/:id/approve', authRequired, adminRequired, (req, res) => {
  const { role } = req.body || {};
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

  const validRoles = ['admin', 'user'];
  const newRole = role && validRoles.includes(role) ? role : (user.role === 'admin' ? 'admin' : 'user');

  db.prepare('UPDATE users SET approved = 1, role = ? WHERE id = ?').run(newRole, req.params.id);

  createAuditLog(db, {
    adminId: req.user.id,
    adminName: req.user.displayName || req.user.username,
    action: 'APPROVE_USER',
    details: `อนุมัติบัญชีผู้ใช้งาน | ชื่อแสดง: ${user.display_name} | username: ${user.username} | สิทธิ์/ยศ: ${newRole} | สมัคร: ${new Date(user.created_at).toLocaleDateString('th-TH')}`,
    target: `user:${req.params.id}`,
  });

  emitEvent('USERS_UPDATED');
  res.json({ message: 'อนุมัติผู้ใช้งานสำเร็จ' });
});

// Endpoint สำหรับเปลี่ยนยศ/สิทธิ์ผู้ใช้งาน (Assign Role)
router.patch('/:id/role', authRequired, adminRequired, (req, res) => {
  const { role } = req.body || {};
  const validRoles = ['admin', 'user'];

  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ error: 'ยศ/สิทธิ์การใช้งานไม่ถูกต้อง' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

  if (req.user.id === req.params.id && role !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คนเสมอ' });
    }
  }

  const roleLabels = {
    admin: 'ผู้ดูแลระบบ (Admin)',
    user: 'ผู้ใช้งานทั่วไป (User)'
  };

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);

  createAuditLog(db, {
    adminId: req.user.id,
    adminName: req.user.displayName || req.user.username,
    action: 'UPDATE_USER_ROLE',
    details: `เปลี่ยนยศ/สิทธิ์ | ชื่อแสดง: ${user.display_name} | username: ${user.username} | ก่อน: ${user.role} → หลัง: ${role}`,
    target: `user:${req.params.id}`,
  });

  emitEvent('USERS_UPDATED');
  res.json({ message: `อัปเดตยศ/สิทธิ์ของ ${user.display_name} เป็น ${roleLabels[role]} เรียบร้อยแล้ว`, role });
});

// Admin รีเซ็ตรหัสผ่านให้ผู้ใช้
router.patch('/:id/reset-password', authRequired, adminRequired, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);

  createAuditLog(db, {
    adminId: req.user.id,
    adminName: req.user.displayName || req.user.username,
    action: 'RESET_USER_PASSWORD',
    details: `รีเซ็ตรหัสผ่านให้ผู้ใช้งาน | ชื่อแสดง: ${user.display_name} | username: ${user.username} | ยศปัจจุบัน: ${user.role}`,
    target: `user:${req.params.id}`,
  });

  res.json({ message: `รีเซ็ตรหัสผ่านของ ${user.display_name} สำเร็จแล้ว` });
});

router.delete('/:id', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

  if (user.id === req.user.id) {
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีผู้ใช้ของตนเองได้' });
  }

  const deleteUserTx = db.transaction(() => {
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM bookings WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  });

  deleteUserTx();

  createAuditLog(db, {
    adminId: req.user.id,
    adminName: req.user.displayName || req.user.username,
    action: 'DELETE_USER',
    details: `ลบบัญชีผู้ใช้งาน | ชื่อแสดง: ${user.display_name} | username: ${user.username} | ยศ: ${user.role} | สมัคร: ${new Date(user.created_at).toLocaleDateString('th-TH')}`,
    target: `user:${req.params.id}`,
  });

  emitEvent('USERS_UPDATED');
  res.json({ message: 'ลบผู้ใช้งานสำเร็จ' });
});

export default router;
