import { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import UserAvatar from '../common/UserAvatar.jsx';

export default function ProfileModal({ open, onClose }) {
  const { user, updateUser, refreshUser, isAdmin } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'password'
  
  // Profile form
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    phone: '',
    department: '',
    avatar: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Password form
  const [pwdForm, setPwdForm] = useState({
    oldPassword: '',
    newPassword: '',
    newPasswordConfirm: '',
  });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');

  // Stats / detail
  const [userStats, setUserStats] = useState({ bookingCount: 0, createdAt: null });

  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setProfileForm({
        displayName: user?.displayName || '',
        phone: user?.phone || '',
        department: user?.department || '',
        avatar: user?.avatar || '',
      });
      setProfileError('');
      setPwdError('');
      setPwdForm({ oldPassword: '', newPassword: '', newPasswordConfirm: '' });
      
      api.me().then((fresh) => {
        if (fresh) {
          setProfileForm((prev) => ({
            displayName: prev.displayName || fresh.displayName || '',
            phone: prev.phone || fresh.phone || '',
            department: prev.department || fresh.department || '',
            avatar: prev.avatar || fresh.avatar || '',
          }));
          setUserStats({
            bookingCount: fresh.bookingCount || 0,
            createdAt: fresh.createdAt,
          });
          updateUser(fresh);
        }
      }).catch(() => {});
    }
    prevOpenRef.current = open;
  }, [open, user]);

  // จัดการอัปโหลดไฟล์รูปภาพ และย่อขนาดเป็น Base64
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // เช็คประเภทไฟล์รูปภาพ
    if (!file.type.startsWith('image/')) {
      return setProfileError('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)');
    }

    // จำกัดขนาดไฟล์ต้นทางไม่เกิน 5MB
    if (file.size > 5 * 1024 * 1024) {
      return setProfileError('ขนาดไฟล์รูปภาพต้องไม่เกิน 5 MB');
    }

    setProfileError('');
    const reader = new FileReader();
    reader.onerror = () => {
      setProfileError('เกิดข้อผิดพลาดในการอ่านไฟล์รูปภาพ');
    };
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => {
        setProfileError('ไม่สามารถประมวลผลไฟล์รูปภาพนี้ได้');
      };
      img.onload = () => {
        try {
          // ย่อขนาดรูปให้อยู่ในสัดส่วนจัตุรัสไม่เกิน 400x400 เพื่อความรวดเร็วและเบา Database
          const canvas = document.createElement('canvas');
          const MAX_DIM = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const resizedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          setProfileForm((prev) => ({ ...prev, avatar: resizedBase64 }));
        } catch {
          setProfileError('ไม่สามารถย่อขนาดรูปภาพได้');
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setProfileForm((prev) => ({ ...prev, avatar: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.displayName.trim()) {
      return setProfileError('กรุณากรอกชื่อแสดงผล / ชื่อ-นามสกุล');
    }
    setProfileError('');
    setProfileLoading(true);
    try {
      const res = await api.updateProfile(profileForm);
      updateUser(res.user);
      showToast('อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว');
      refreshUser();
      onClose();
    } catch (err) {
      setProfileError(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pwdForm.oldPassword || !pwdForm.newPassword || !pwdForm.newPasswordConfirm) {
      return setPwdError('กรุณากรอกรหัสผ่านให้ครบทุกช่อง');
    }
    if (pwdForm.newPassword.length < 8) {
      return setPwdError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
    }
    if (pwdForm.newPassword !== pwdForm.newPasswordConfirm) {
      return setPwdError('รหัสผ่านยืนยันไม่ตรงกัน');
    }

    setPwdError('');
    setPwdLoading(true);
    try {
      await api.changePassword(pwdForm);
      showToast('เปลี่ยนรหัสผ่านสำเร็จ');
      setPwdForm({ oldPassword: '', newPassword: '', newPasswordConfirm: '' });
      setActiveTab('profile');
    } catch (err) {
      setPwdError(err.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="โปรไฟล์ผู้ใช้งาน" size="md">
      {/* Header Profile Badge */}
      <div className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 via-teal-600 to-emerald-600 p-4 text-white shadow-md">
        <div className="flex items-center gap-3.5">
          <UserAvatar
            avatar={profileForm.avatar}
            name={profileForm.displayName || user?.displayName}
            size="lg"
            className="ring-2 ring-white/40"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-bold sm:text-lg">
                {profileForm.displayName || user?.displayName || 'ผู้ใช้งาน'}
              </h2>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                isAdmin 
                  ? 'bg-amber-400 text-amber-950 shadow-xs' 
                  : 'bg-white/25 text-white'
              }`}>
                {isAdmin ? 'Admin' : 'User'}
              </span>
            </div>
            <p className="truncate text-xs text-white/80">@{user?.username}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/90">
              <span>📋 จองแล้ว {userStats.bookingCount} รายการ</span>
              {profileForm.department && (
                <span>🏛️ {profileForm.department}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex-1 border-b-2 py-2 text-center text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          ข้อมูลทั่วไป
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('password')}
          className={`flex-1 border-b-2 py-2 text-center text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'password'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          เปลี่ยนรหัสผ่าน
        </button>
      </div>

      {activeTab === 'profile' && (
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          {/* ส่วนแนบไฟล์รูปหน้าตัวเอง (Upload Photo) */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
            <label className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">
              รูปถ่ายโปรไฟล์ (แนบไฟล์รูปภาพของคุณ)
            </label>
            <div className="flex items-center gap-4">
              <UserAvatar
                avatar={profileForm.avatar}
                name={profileForm.displayName || user?.displayName}
                size="xl"
                className="ring-2 ring-brand-500/20"
              />
              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  onClick={(e) => { e.target.value = ''; }}
                  accept="image/*"
                  className="hidden"
                  id="avatar-file-input"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📷 เลือกรูปภาพใหม่
                  </Button>
                  {profileForm.avatar && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={handleRemoveAvatar}
                    >
                      ลบรูป
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  รองรับไฟล์ JPG, PNG หรือ WebP (ระบบจะย่อขนาดให้อัตโนมัติอย่างคมชัด)
                </p>
              </div>
            </div>
          </div>

          <Input
            label="ชื่อ-นามสกุล / ชื่อแสดงผล *"
            placeholder="เช่น อ.สมชาย ใจดี"
            value={profileForm.displayName}
            onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="เบอร์โทรศัพท์ติดต่อ"
              placeholder="เช่น 081-234-5678"
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
            />
            <Input
              label="ภาควิชา / สังกัด"
              placeholder="เช่น อายุรศาสตร์, งานโสตฯ"
              value={profileForm.department}
              onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
            />
          </div>

          {profileError && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400" role="alert">
              ⚠️ {profileError}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button type="button" variant="neutral" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" loading={profileLoading}>
              บันทึกข้อมูล
            </Button>
          </div>
        </form>
      )}

      {activeTab === 'password' && (
        <form onSubmit={handleChangePassword} className="space-y-3">
          <Input
            label="รหัสผ่านปัจจุบัน *"
            type="password"
            value={pwdForm.oldPassword}
            onChange={(e) => setPwdForm({ ...pwdForm, oldPassword: e.target.value })}
            placeholder="กรอกรหัสผ่านปัจจุบัน"
            required
          />
          <Input
            label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร) *"
            type="password"
            value={pwdForm.newPassword}
            onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
            placeholder="กำหนดรหัสผ่านใหม่"
            required
          />
          <Input
            label="ยืนยันรหัสผ่านใหม่ *"
            type="password"
            value={pwdForm.newPasswordConfirm}
            onChange={(e) => setPwdForm({ ...pwdForm, newPasswordConfirm: e.target.value })}
            placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
            required
          />

          {pwdError && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400" role="alert">
              ⚠️ {pwdError}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button type="button" variant="neutral" onClick={() => setActiveTab('profile')}>
              ย้อนกลับ
            </Button>
            <Button type="submit" loading={pwdLoading}>
              ยืนยันเปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
