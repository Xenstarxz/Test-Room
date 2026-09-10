import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';

export default function LoginPage() {
  const { user, loading, login, register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForgotMsg, setShowForgotMsg] = useState(false);
  const [form, setForm] = useState({
    username: '', password: '', displayName: '', passwordConfirm: '',
  });

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ username: form.username, password: form.password });
        navigate('/dashboard');
      } else {
        await register(form);
        showToast('สมัครสำเร็จ รอผู้ดูแลระบบอนุมัติ', 'info');
        setMode('login');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="glass-card w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-green-500 text-2xl font-extrabold text-white">▦</div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">ระบบจองห้องเรียน<br />และห้องประชุม</h1>
          <p className="mt-1 text-sm text-slate-500">จอง ตรวจสอบสถานะ และติดตามการใช้งานห้อง</p>
        </div>

        <form className="grid gap-3" onSubmit={onSubmit}>
          {mode === 'register' && (
            <Input label="ชื่อ-นามสกุล" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
          )}
          <Input label="ชื่อผู้ใช้" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input label="รหัสผ่าน" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          {mode === 'register' && (
            <Input label="ยืนยันรหัสผ่าน" type="password" value={form.passwordConfirm} onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })} required />
          )}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Button type="submit" full loading={submitting}>{mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</Button>

          <div className="flex items-center justify-between pt-1">
            <Button type="button" variant={mode === 'login' ? 'outline' : 'neutral'} size="sm" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? 'สมัครสมาชิก' : 'กลับเข้าสู่ระบบ'}
            </Button>
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => setShowForgotMsg(!showForgotMsg)}
                className="text-xs font-semibold text-slate-500 hover:text-brand-600 dark:text-slate-400"
              >
                ลืมรหัสผ่าน?
              </button>
            )}
          </div>
        </form>

        {showForgotMsg && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
            <strong>คำแนะนำเมื่อลืมรหัสผ่าน:</strong><br />
            หากลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อทำการรีเซ็ตรหัสผ่านใหม่ผ่านระบบจัดการผู้ใช้งาน
          </div>
        )}
      </div>
    </div>
  );
}

