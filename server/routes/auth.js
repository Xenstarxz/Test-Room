import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { getDb } from '../db/database.js';
import { createUserLog } from '../db/database.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { ADMIN_USERNAME } from '../data/constants.js';
import { getAllSettings } from './settings.js';
import { emitEvent } from '../utils/socket.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ในอีก 15 นาที' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  if (user.role !== 'admin' && !user.approved) {
    return res.status(403).json({ error: 'บัญชียังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ' });
  }

  const token = signToken(user);

  // User Log: เข้าสู่ระบบสำเร็จ
  createUserLog(getDb(), {
    userId: user.id,
    userName: user.display_name,
    action: 'LOGIN',
    details: `เข้าสู่ระบบสำเร็จ | username: ${user.username} | ยศ: ${user.role}`,
    meta: { username: user.username, role: user.role },
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      isAdmin: user.role === 'admin',
      phone: user.phone || '',
      department: user.department || '',
      avatar: user.avatar || '',
    },
  });
});

router.post('/register', loginLimiter, (req, res) => {
  const { displayName, username, password, passwordConfirm } = req.body || {};
  if (!displayName?.trim() || !username?.trim() || !password) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
  }
  if (password !== passwordConfirm) {
    return res.status(400).json({ error: 'รหัสผ่านยืนยันไม่ตรงกัน' });
  }
  if (username.trim().toLowerCase() === ADMIN_USERNAME) {
    return res.status(400).json({ error: 'ไม่สามารถใช้ชื่อผู้ใช้นี้ได้' });
  }

  const db = getDb();
  const settings = getAllSettings(db);

  if (settings.allow_registration === false) {
    return res.status(403).json({ error: 'ระบบปิดรับการสมัครสมาชิกใหม่ชั่วคราวตามนโยบายของผู้ดูแลระบบ' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
  if (exists) return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });

  const hash = bcrypt.hashSync(password, 10);
  const id = randomUUID();
  const initialApproved = settings.require_approval === false ? 1 : 0;

  db.prepare(
    'INSERT INTO users (id, username, password_hash, display_name, role, approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, username.trim(), hash, displayName.trim(), 'user', initialApproved, Date.now());

  res.status(201).json({
    message: initialApproved ? 'สมัครสมาชิกสำเร็จ เข้าสู่ระบบได้ทันที' : 'สมัครสำเร็จ รอผู้ดูแลระบบอนุมัติ'
  });

  // User Log: สมัครสมาชิก
  createUserLog(getDb(), {
    userId: id,
    userName: displayName.trim(),
    action: 'REGISTER',
    details: `สมัครสมาชิกใหม่ | username: ${username.trim()} | ชื่อแสดง: ${displayName.trim()} | สถานะ: ${initialApproved ? 'อนุมัติอัตโนมัติ' : 'รออนุมัติจากแอดมิน'}`,
    meta: { username: username.trim(), autoApproved: Boolean(initialApproved) },
  });
});

router.get('/me', authRequired, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, display_name, role, approved, phone, department, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

  const bookingCount = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE user_id = ? AND status != 'cancelled'").get(user.id).c;

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    isAdmin: user.role === 'admin',
    phone: user.phone || '',
    department: user.department || '',
    avatar: user.avatar || '',
    createdAt: user.created_at,
    bookingCount,
  });
});

// อัปเดตข้อมูลโปรไฟล์ส่วนตัว (ชื่อแสดงผล, เบอร์โทร, แผนก/สังกัด, อวาตาร์)
router.put('/profile', authRequired, (req, res) => {
  const { displayName, phone, department, avatar } = req.body || {};
  if (!displayName?.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุชื่อ-นามสกุล / ชื่อแสดงผล' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

  const nextDisplayName = displayName.trim();
  const nextPhone = (phone || '').trim();
  const nextDepartment = (department || '').trim();
  const nextAvatar = (avatar || '').trim();

  db.prepare(`
    UPDATE users 
    SET display_name = ?, phone = ?, department = ?, avatar = ? 
    WHERE id = ?
  `).run(nextDisplayName, nextPhone, nextDepartment, nextAvatar, user.id);

  // ปรับปรุงชื่อผู้จองในรายการจองเดิมที่ยังไม่ถูกยกเลิกด้วย
  db.prepare(`
    UPDATE bookings 
    SET booker_name = ? 
    WHERE user_id = ?
  `).run(nextDisplayName, user.id);

  createUserLog(db, {
    userId: user.id,
    userName: nextDisplayName,
    action: 'UPDATE_PROFILE',
    details: `อัปเดตข้อมูลโปรไฟล์ | ชื่อ: ${nextDisplayName} | สังกัด: ${nextDepartment || '-'} | เบอร์: ${nextPhone || '-'}`,
    meta: { displayName: nextDisplayName, phone: nextPhone, department: nextDepartment },
  });

  emitEvent('USERS_UPDATED');
  emitEvent('BOOKINGS_UPDATED');

  res.json({
    message: 'อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว',
    user: {
      id: user.id,
      username: user.username,
      displayName: nextDisplayName,
      role: user.role,
      isAdmin: user.role === 'admin',
      phone: nextPhone,
      department: nextDepartment,
      avatar: nextAvatar,
    },
  });
});

router.post('/change-password', authRequired, (req, res) => {
  const { oldPassword, newPassword, newPasswordConfirm } = req.body || {};
  if (!oldPassword || !newPassword || !newPasswordConfirm) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
  }
  if (newPassword !== newPasswordConfirm) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ไม่ตรงกัน' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);

  // User Log: เปลี่ยนรหัสผ่าน
  createUserLog(db, {
    userId: user.id,
    userName: user.display_name,
    action: 'CHANGE_PASSWORD',
    details: `เปลี่ยนรหัสผ่านตนเองสำเร็จ | username: ${user.username}`,
    meta: { username: user.username },
  });

  res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
});

export default router;
