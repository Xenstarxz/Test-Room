import { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input, { Select } from '../ui/Input.jsx';
import { api } from '../../api/client.js';
import { formatThaiDate, formatTime, todayKey, addDaysToKey } from '../../utils/date.js';
import TimeSelector, { validateTime } from './TimeSelector.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirm } from '../../context/ConfirmContext.jsx';
import Tooltip from '../common/Tooltip.jsx';

const PURPOSES = ['การเรียนการสอน', 'ประชุม', 'จัดกิจกรรม', 'อื่นๆ'];

// Default fallback limits ถ้า server ยังไม่ได้ตั้งค่า
const DEFAULT_LIMIT = { min: 0, max: 5, unit: 'ชิ้น', icon: '📦' };

// ดึง limit ของอุปกรณ์จาก meta (dynamic จาก settings) พร้อม fallback
function getLimit(meta, item) {
  return (meta?.equipmentLimits?.[item]) || DEFAULT_LIMIT;
}

// คำนวณช่วง (range) และสีของอุปกรณ์ตามจำนวนที่ขอ และสต็อกที่เหลือ
function getEquipmentStatus(count, max, availableStock = max) {
  if (availableStock <= 0) {
    return {
      label: 'ของหมดในช่วงเวลานี้',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 font-bold',
      dotClass: 'bg-rose-500 animate-ping',
      barClass: 'bg-rose-500',
      cardClass: 'border-rose-400 bg-rose-50/40 dark:border-rose-800/60 dark:bg-rose-950/20 opacity-90',
    };
  }

  if (count === 0) {
    return {
      label: 'ไม่ได้ขอ',
      badgeClass: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      dotClass: 'bg-slate-400',
      barClass: 'bg-transparent',
      cardClass: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40',
    };
  }

  const effectiveCap = Math.max(1, Math.min(max, availableStock));
  const ratio = count / effectiveCap;

  // แตะขีดสุดที่ขอได้
  if (count >= effectiveCap) {
    return {
      label: count >= max ? 'เต็มโควต้าต่อครั้ง (Max)' : 'หมดสต็อกช่วงเวลานี้',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 font-bold',
      dotClass: 'bg-rose-500 animate-pulse',
      barClass: 'bg-rose-500',
      cardClass: 'border-rose-400 bg-rose-50/50 dark:border-rose-800/70 dark:bg-rose-950/25 shadow-sm',
    };
  }

  // ปานกลาง
  if (ratio > 0.5) {
    return {
      label: 'ปานกลาง (ใกล้ลิมิต)',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
      dotClass: 'bg-amber-500',
      barClass: 'bg-amber-500',
      cardClass: 'border-amber-300 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/20',
    };
  }

  // ปกติ
  return {
    label: 'ปกติ (มีพร้อม)',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
    barClass: 'bg-emerald-500',
    cardClass: 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20',
  };
}

function parseOtherPurpose(text) {
  let meetingDetail = '';
  let activityDetail = '';
  let otherPurpose = '';

  if (!text) return { meetingDetail, activityDetail, otherPurpose };

  const parts = text.split(' | ');
  const remaining = [];
  for (const part of parts) {
    if (part.startsWith('ประชุม: ')) {
      meetingDetail = part.replace(/^ประชุม:\s*/, '');
    } else if (part.startsWith('กิจกรรม: ')) {
      activityDetail = part.replace(/^กิจกรรม:\s*/, '');
    } else if (part.startsWith('อื่นๆ: ')) {
      remaining.push(part.replace(/^อื่นๆ:\s*/, ''));
    } else {
      remaining.push(part);
    }
  }
  otherPurpose = remaining.join(' | ');
  return { meetingDetail, activityDetail, otherPurpose };
}

function parseEquipmentCounts(equipmentList, metaEquipment = []) {
  const counts = {};
  metaEquipment.forEach((item) => {
    counts[item] = 0;
  });

  (equipmentList || []).forEach((entry) => {
    if (typeof entry !== 'string') return;
    const match = entry.match(/^(.+?)(?:\s*\(([0-9]+).*?\))?$/);
    if (match) {
      const name = match[1].trim();
      const qty = match[2] ? parseInt(match[2], 10) : 1;
      counts[name] = qty;
    }
  });

  return counts;
}

function emptyForm(draft, meta) {
  const initialCounts = {};
  (meta?.equipment || []).forEach((item) => {
    initialCounts[item] = 0;
  });

  return {
    date: draft?.date || todayKey(),
    period: draft?.period || 'morning',
    start: draft?.start || 8,
    end: draft?.end || 9,
    purpose: [],
    meetingDetail: '',
    activityDetail: '',
    years: [],
    subjects: [],
    equipment: [],
    equipmentCounts: initialCounts,
    otherPurpose: '',
    otherEquipment: '',
    recurring: false,
    weeks: 4,
  };
}

function formFromBooking(booking, meta) {
  const parsedOther = parseOtherPurpose(booking.otherPurpose || '');
  const counts = parseEquipmentCounts(booking.equipment || [], meta?.equipment || []);

  return {
    date: booking.date,
    period: booking.period,
    start: booking.start,
    end: booking.end,
    purpose: booking.purpose || [],
    meetingDetail: parsedOther.meetingDetail,
    activityDetail: parsedOther.activityDetail,
    years: (booking.years || []).map(String),
    subjects: booking.subjects || [],
    equipment: booking.equipment || [],
    equipmentCounts: counts,
    otherPurpose: parsedOther.otherPurpose,
    otherEquipment: booking.otherEquipment || '',
    recurring: false,
    weeks: 4,
  };
}

// สร้างข้อความอธิบาย conflict จากข้อมูลที่ backend ส่งมา
function formatConflicts(conflicts) {
  if (!conflicts?.length) return '';
  return conflicts
    .map((c) => `${formatTime(c.start)}–${formatTime(c.end)} (โดย ${c.bookerName})`)
    .join(', ');
}

export default function BookingModal({ open, onClose, room, draft, meta, onSuccess, mode = 'create', editingBooking = null }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isEdit = mode === 'edit' && editingBooking;
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => (isEdit ? formFromBooking(editingBooking, meta) : emptyForm(draft, meta)));
  const [equipmentAvail, setEquipmentAvail] = useState({});
  const [needEquipment, setNeedEquipment] = useState(() => {
    if (isEdit) {
      const counts = parseEquipmentCounts(editingBooking?.equipment || [], meta?.equipment || []);
      const hasAny = Object.values(counts).some((v) => v > 0);
      return hasAny;
    }
    return false;
  });
  const [hasOtherEquipment, setHasOtherEquipment] = useState(() => {
    return isEdit && Boolean(editingBooking?.otherEquipment?.trim());
  });

  const actualStart = form.period === 'fullday' ? meta?.timeWindows?.fullday?.start : form.start;
  const actualEnd = form.period === 'fullday' ? meta?.timeWindows?.fullday?.end : form.end;

  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(1);
      setError('');
      setForm(isEdit ? formFromBooking(editingBooking, meta) : emptyForm(draft, meta));
      const counts = isEdit ? parseEquipmentCounts(editingBooking?.equipment || [], meta?.equipment || []) : {};
      const hasAny = Object.values(counts).some((v) => v > 0);
      setNeedEquipment(hasAny);
      setHasOtherEquipment(isEdit && Boolean(editingBooking?.otherEquipment?.trim()));
    }
    wasOpen.current = open;
  }, [open, draft, isEdit, editingBooking, meta]);

  // ดึงข้อมูลสต็อกอุปกรณ์คงเหลือตามช่วงเวลาจริง (Real-time Overlapping Inventory)
  useEffect(() => {
    if (!open || !form.date || actualStart == null || actualEnd == null || actualStart >= actualEnd) return;
    let active = true;
    api.getEquipmentAvailability({
      date: form.date,
      start: actualStart,
      end: actualEnd,
      excludeBookingId: editingBooking?.id,
    })
      .then((res) => {
        if (active && res?.availability) {
          setEquipmentAvail(res.availability);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch equipment availability:', err);
      });
    return () => {
      active = false;
    };
  }, [open, form.date, actualStart, actualEnd, editingBooking?.id]);

  if (!room || !meta) return null;

  const timeError = form.period === 'fullday' ? '' : validateTime(form.period, form.start, form.end, meta.timeWindows);
  const teaching = form.purpose.includes('การเรียนการสอน');

  const toggle = (key, value) => {
    setForm((f) => {
      const exists = f[key].includes(value);
      const nextList = exists ? f[key].filter((v) => v !== value) : [...f[key], value];
      const updates = { [key]: nextList };

      // ล้างข้อมูลรายละเอียดเมื่อนำการติ๊กออก
      if (key === 'purpose' && exists) {
        if (value === 'ประชุม') updates.meetingDetail = '';
        if (value === 'จัดกิจกรรม') updates.activityDetail = '';
        if (value === 'อื่นๆ') updates.otherPurpose = '';
      }

      return { ...f, ...updates };
    });
  };

  const setEquipmentCount = (item, val) => {
    const limit = getLimit(meta, item);
    const stockInfo = equipmentAvail[item];
    const availableStock = stockInfo ? stockInfo.available : (meta?.equipmentStock?.[item] ?? limit.max);
    const maxAllowed = Math.min(limit.max, availableStock);
    const clamped = Math.max(limit.min, Math.min(maxAllowed, Number(val) || 0));

    setForm((f) => {
      const nextCounts = { ...(f.equipmentCounts || {}), [item]: clamped };
      const nextEquipment = Object.entries(nextCounts)
        .filter(([_, q]) => q > 0)
        .map(([name, q]) => `${name} (${q} ${getLimit(meta, name).unit || 'ชิ้น'})`);

      return {
        ...f,
        equipmentCounts: nextCounts,
        equipment: nextEquipment,
      };
    });
  };

  const buildPayload = () => {
    // รวมรายละเอียดเพิ่มเติมของ ประชุม / กิจกรรม / อื่นๆ ส่งไปที่ backend
    const purposeNotes = [];
    if (form.purpose.includes('ประชุม') && form.meetingDetail?.trim()) {
      purposeNotes.push(`ประชุม: ${form.meetingDetail.trim()}`);
    }
    if (form.purpose.includes('จัดกิจกรรม') && form.activityDetail?.trim()) {
      purposeNotes.push(`กิจกรรม: ${form.activityDetail.trim()}`);
    }
    if (form.purpose.includes('อื่นๆ') && form.otherPurpose?.trim()) {
      purposeNotes.push(`อื่นๆ: ${form.otherPurpose.trim()}`);
    }

    const combinedOtherPurpose = purposeNotes.length > 0
      ? purposeNotes.join(' | ')
      : (form.otherPurpose?.trim() || '');

    const equipmentList = needEquipment
      ? Object.entries(form.equipmentCounts || {})
          .filter(([_, qty]) => qty > 0)
          .map(([item, qty]) => `${item} (${qty} ${getLimit(meta, item).unit || 'ชิ้น'})`)
      : [];

    return {
      roomId: room.id,
      date: form.date,
      period: form.period,
      start: form.period === 'fullday' ? meta.timeWindows.fullday.start : form.start,
      end: form.period === 'fullday' ? meta.timeWindows.fullday.end : form.end,
      purpose: form.purpose,
      years: form.years.map(Number),
      subjects: form.subjects,
      equipment: equipmentList,
      otherPurpose: combinedOtherPurpose,
      otherEquipment: hasOtherEquipment ? (form.otherEquipment || '').trim() : '',
    };
  };

  const validateStep2 = () => {
    if (!form.purpose.length) {
      setError('กรุณาเลือกวัตถุประสงค์อย่างน้อย 1 รายการ');
      return false;
    }
    if (form.purpose.includes('อื่นๆ') && !form.otherPurpose.trim()) {
      setError('กรุณาระบุวัตถุประสงค์อื่น');
      return false;
    }
    setError('');
    return true;
  };

  const submit = async () => {
    setError('');
    if (!form.purpose.length) return setError('กรุณาเลือกวัตถุประสงค์อย่างน้อย 1 รายการ');
    if (form.purpose.includes('อื่นๆ') && !form.otherPurpose.trim()) return setError('กรุณาระบุวัตถุประสงค์อื่น');
    if (timeError) return setError(timeError);
    if (meta?.advanceBookingDays) {
      const maxDateKey = addDaysToKey(todayKey(), meta.advanceBookingDays);
      if (form.date > maxDateKey) {
        return setError(`ไม่สามารถจองล่วงหน้าเกิน ${meta.advanceBookingDays} วันได้`);
      }
    }
    if (form.recurring && (!Number.isInteger(Number(form.weeks)) || form.weeks < 2 || form.weeks > 12)) {
      return setError('จำนวนสัปดาห์ต้องอยู่ระหว่าง 2-12');
    }

    setLoading(true);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await api.updateBooking(editingBooking.id, payload);
        showToast('แก้ไขการจองสำเร็จ');
      } else if (form.recurring) {
        const result = await api.createRecurringBooking({ ...payload, weeks: Number(form.weeks) });
        if (result.created.length && !result.skipped.length) {
          showToast(`จองสำเร็จทั้งหมด ${result.created.length} ครั้ง รอผู้ดูแลระบบยืนยัน`);
        } else if (result.created.length && result.skipped.length) {
          showToast(`จองสำเร็จ ${result.created.length} ครั้ง · ชนเวลา ${result.skipped.length} ครั้ง (${result.skipped.map((s) => formatThaiDate(s.date)).join(', ')})`, 'info');
        } else {
          setError(`ห้องถูกจองในช่วงเวลานี้ทุกสัปดาห์: ${result.skipped.map((s) => formatThaiDate(s.date)).join(', ')}`);
          setLoading(false);
          return;
        }
      } else {
        await api.createBooking(payload);
        showToast('จองสำเร็จ รอผู้ดูแลระบบยืนยัน');
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      if (err.data?.conflicts?.length) {
        setError(`ห้องถูกจองในช่วงเวลานี้แล้ว: ${formatConflicts(err.data.conflicts)}`);
        showToast('ห้องถูกจองในช่วงเวลานี้แล้ว', 'error');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSafeClose = async () => {
    const hasEquipment = Object.values(form.equipmentCounts || {}).some((q) => q > 0) || Boolean(form.otherEquipment?.trim());
    if (step > 1 || form.purpose.length > 0 || hasEquipment) {
      const ok = await confirm({
        title: 'ปิดแบบฟอร์ม',
        message: 'ปิดแล้วข้อมูลที่กรอกจะหายทั้งหมด ต้องการปิดหรือไม่?',
        confirmText: 'ปิด',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={handleSafeClose} title={isEdit ? `แก้ไขการจอง ${room.name}` : `จอง ${room.name}`} size="lg">
      <div className="mb-3 flex gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>
      <div className="mb-4 flex justify-between text-[11px] font-bold text-slate-400">
        <span className={step === 1 ? 'text-brand-600 dark:text-brand-400' : ''}>1. วันเวลา</span>
        <span className={step === 2 ? 'text-brand-600 dark:text-brand-400' : ''}>2. รายละเอียด</span>
        <span className={step === 3 ? 'text-brand-600 dark:text-brand-400' : ''}>3. อุปกรณ์พื้นฐาน</span>
      </div>

      <div className="mb-4 rounded-xl bg-brand-50 p-3 text-sm dark:bg-cyan-950/40">
        <strong>{room.name}</strong> ({room.capacity})
        <div className="text-slate-600 dark:text-slate-400">
          {formatThaiDate(form.date)} · {formatTime(form.period === 'fullday' ? meta.timeWindows.fullday.start : form.start)}–{formatTime(form.period === 'fullday' ? meta.timeWindows.fullday.end : form.end)}
        </div>
      </div>

      {step === 1 && (
        <div className="grid gap-3">
          <Input
            label="วันที่"
            type="date"
            min={todayKey()}
            max={meta?.advanceBookingDays ? addDaysToKey(todayKey(), meta.advanceBookingDays) : undefined}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <Select label="ช่วงเวลา" value={form.period} onChange={(e) => {
            const p = e.target.value;
            const w = meta.timeWindows[p];
            setForm({ ...form, period: p, start: w.start, end: Math.min(w.start + 1, w.end) });
          }}>
            {Object.entries(meta.timeWindows).map(([key, w]) => (
              <option key={key} value={key}>{w.label} ({formatTime(w.start)}–{formatTime(w.end)})</option>
            ))}
          </Select>
          {form.period !== 'fullday' ? (
            <TimeSelector
              period={form.period}
              timeWindows={meta.timeWindows}
              start={form.start}
              end={form.end}
              onStartChange={(start) => setForm({ ...form, start })}
              onEndChange={(end) => setForm({ ...form, end })}
              error={timeError}
            />
          ) : (
            <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40">จองทั้งวัน 08:00–16:00</p>
          )}

          {room.status === 'maintenance' && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300">
              🔧 ห้องนี้อยู่ระหว่างปิดปรับปรุงชั่วคราว ไม่สามารถทำรายการจองได้ในขณะนี้
            </div>
          )}

          {!isEdit && (
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={form.recurring} disabled={room.status === 'maintenance'} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} />
                จองซ้ำทุกสัปดาห์ (สำหรับวิชาที่เข้าห้องเดิมทุกสัปดาห์)
                <Tooltip text="ระบบจะสร้างรายการจองวันเวลาเดียวกันนี้ล่วงหน้าตามจำนวนสัปดาห์ที่เลือก สัปดาห์ใดที่มีคนจองแล้วระบบจะแจ้งเตือนและข้ามสัปดาห์นั้นให้อัตโนมัติ" />
              </label>
              {form.recurring && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span>จำนวนสัปดาห์:</span>
                  <input
                    type="number"
                    min={2}
                    max={12}
                    value={form.weeks}
                    onChange={(e) => setForm({ ...form, weeks: Number(e.target.value) })}
                    className="min-h-9 w-20 rounded-lg border border-slate-300 px-2 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <span className="text-xs text-slate-500">(2-12 สัปดาห์ นับจากวันที่เลือกด้านบน)</span>
                </div>
              )}
            </div>
          )}

          <Button disabled={room.status === 'maintenance'} onClick={() => (timeError && form.period !== 'fullday' ? setError(timeError) : setStep(2))}>ถัดไป</Button>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-3">
          <fieldset>
            <div className="mb-2 flex items-center justify-between">
              <legend className="text-sm font-bold text-slate-700 dark:text-slate-200">
                วัตถุประสงค์ <span className="text-red-500">*</span>
              </legend>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                (ต้องเลือกอย่างน้อย 1 รายการ)
              </span>
            </div>

            <div className="grid gap-2.5">
              {PURPOSES.map((p) => {
                const isChecked = form.purpose.includes(p);
                return (
                  <div
                    key={p}
                    className={`rounded-xl border p-2.5 transition-all ${
                      isChecked
                        ? 'border-brand-300 bg-brand-50/30 dark:border-brand-800 dark:bg-brand-950/20'
                        : 'border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle('purpose', p)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span>{p}</span>
                    </label>

                    {/* ช่องพิมพ์เมื่อเลือก "ประชุม" */}
                    {p === 'ประชุม' && isChecked && (
                      <div className="mt-2.5 pl-6.5 animate-fadeIn">
                        <Input
                          placeholder="ระบุหัวข้อ/รายละเอียดการประชุม (เช่น ประชุมภาควิชา, วางแผนงาน)"
                          value={form.meetingDetail}
                          onChange={(e) => setForm({ ...form, meetingDetail: e.target.value })}
                          autoFocus
                        />
                      </div>
                    )}

                    {/* ช่องพิมพ์เมื่อเลือก "จัดกิจกรรม" */}
                    {p === 'จัดกิจกรรม' && isChecked && (
                      <div className="mt-2.5 pl-6.5 animate-fadeIn">
                        <Input
                          placeholder="ระบุรายละเอียดกิจกรรม (เช่น อบรมเชิงปฏิบัติการ, สัมมนา)"
                          value={form.activityDetail}
                          onChange={(e) => setForm({ ...form, activityDetail: e.target.value })}
                          autoFocus
                        />
                      </div>
                    )}

                    {/* ช่องพิมพ์เมื่อเลือก "อื่นๆ" */}
                    {p === 'อื่นๆ' && isChecked && (
                      <div className="mt-2.5 pl-6.5 animate-fadeIn">
                        <Input
                          placeholder="ระบุวัตถุประสงค์อื่น"
                          value={form.otherPurpose}
                          onChange={(e) => setForm({ ...form, otherPurpose: e.target.value })}
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {form.purpose.length === 0 && (
              <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <span>⚠️</span> กรุณาเลือกวัตถุประสงค์อย่างน้อย 1 รายการก่อนกดถัดไป
              </p>
            )}
          </fieldset>

          {teaching && (
            <fieldset>
              <legend className="mb-2 text-sm font-bold">รายละเอียดการเรียนการสอน</legend>
              {[5, 6, 7].map((year) => (
                <div key={year} className="mb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.years.includes(String(year))} onChange={() => toggle('years', String(year))} />
                    ชั้นปีที่ {year}
                  </label>
                  {form.years.includes(String(year)) && (
                    <div className="ml-6 mt-1 flex flex-wrap gap-1">
                      {(meta.subjects[year] || []).map((s) => (
                        <label key={s} className="flex items-center gap-1 rounded-lg border border-blue-200 px-2 py-1 text-xs dark:border-blue-900">
                          <input type="checkbox" checked={form.subjects.includes(s)} onChange={() => toggle('subjects', s)} />
                          {s}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </fieldset>
          )}

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <div className="flex gap-2">
            <Button variant="neutral" onClick={() => { setError(''); setStep(1); }}>ย้อนกลับ</Button>
            <Button
              disabled={form.purpose.length === 0}
              onClick={() => {
                if (validateStep2()) {
                  setStep(3);
                }
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-3">
          <fieldset>
            <div className="mb-2.5 flex items-center justify-between">
              <legend className="text-sm font-bold text-slate-700 dark:text-slate-200">
                อุปกรณ์พื้นฐาน
              </legend>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                จำกัดโควต้าตามจำนวนของที่มี
              </span>
            </div>

            {/* Checkbox หลัก: อุปกรณ์พื้นฐาน */}
            <div
              className={`rounded-xl border p-3 transition-all ${
                needEquipment
                  ? 'border-brand-300 bg-brand-50/20 dark:border-brand-800 dark:bg-brand-950/10'
                  : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-700/80'
              }`}
            >
              <label className="flex items-center gap-2.5 text-sm font-semibold cursor-pointer select-none text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={needEquipment}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setNeedEquipment(checked);
                    if (!checked) {
                      // เมื่อยกเลิก ให้รีเซ็ตจำนวนอุปกรณ์ทั้งหมดเป็น 0
                      const resetCounts = {};
                      meta.equipment.forEach((it) => { resetCounts[it] = 0; });
                      setForm((f) => ({ ...f, equipmentCounts: resetCounts, equipment: [] }));
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>อุปกรณ์พื้นฐาน</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  (ไมค์, สายต่อจอ, พอยเตอร์ ฯลฯ)
                </span>
              </label>

              {/* เมื่อติ๊กถูก จะกางตัวเลือกอุปกรณ์แต่ละรายการออกมา */}
              {needEquipment && (
                <div className="mt-3 grid grid-cols-1 gap-2.5 pl-6.5 sm:grid-cols-2 animate-fadeIn">
                  {meta.equipment.map((item) => {
                    const limit = getLimit(meta, item);
                    const stockInfo = equipmentAvail[item];
                    const availableStock = stockInfo ? stockInfo.available : (meta?.equipmentStock?.[item] ?? limit.max);
                    const totalStock = stockInfo ? stockInfo.totalStock : (meta?.equipmentStock?.[item] ?? limit.max);
                    const maxAllowed = Math.min(limit.max, availableStock);
                    const count = form.equipmentCounts?.[item] || 0;
                    const status = getEquipmentStatus(count, limit.max, availableStock);

                    return (
                      <div
                        key={item}
                        className={`flex flex-col justify-between rounded-xl border p-3 transition-all duration-200 ${status.cardClass}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={count > 0}
                              disabled={availableStock <= 0 && count === 0}
                              onChange={(e) => {
                                const newCount = e.target.checked ? Math.max(1, Math.min(maxAllowed, 1)) : 0;
                                setEquipmentCount(item, newCount);
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
                            />
                            <span className="text-base" aria-hidden="true">{limit.icon}</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{item}</span>
                          </label>

                          {/* Stepper (+ / -) พร้อม Min/Max/Available */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEquipmentCount(item, Math.max(limit.min, count - 1))}
                              disabled={count <= limit.min}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-700 shadow-xs hover:bg-slate-100 active:scale-95 disabled:pointer-events-none disabled:opacity-30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              aria-label={`ลดจำนวน ${item}`}
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">
                              {count}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEquipmentCount(item, Math.min(maxAllowed, count + 1))}
                              disabled={count >= maxAllowed || availableStock <= 0}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-700 shadow-xs hover:bg-slate-100 active:scale-95 disabled:pointer-events-none disabled:opacity-30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              aria-label={`เพิ่มจำนวน ${item}`}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Range Status & Color Bar */}
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${status.badgeClass}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                              {status.label}
                            </span>
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              เหลือ {availableStock} {limit.unit}
                            </span>
                          </div>

                          {/* Visual Progress Bar */}
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                            <div
                              className={`h-full transition-all duration-300 ${status.barClass}`}
                              style={{ width: `${Math.min(100, limit.max > 0 ? (count / limit.max) * 100 : 0)}%` }}
                            />
                          </div>

                          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                            <span>โควตาต่อครั้ง: สูงสุด {limit.max} {limit.unit}</span>
                            <span>สต็อกรวม {totalStock} {limit.unit}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Checkbox: อื่นๆ */}
            <div
              className={`mt-2.5 rounded-xl border p-3 transition-all ${
                hasOtherEquipment
                  ? 'border-brand-300 bg-brand-50/20 dark:border-brand-800 dark:bg-brand-950/10'
                  : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-700/80'
              }`}
            >
              <label className="flex items-center gap-2.5 text-sm font-semibold cursor-pointer select-none text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={hasOtherEquipment}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHasOtherEquipment(checked);
                    if (!checked) {
                      setForm((f) => ({ ...f, otherEquipment: '' }));
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>อื่นๆ (อุปกรณ์นอกเหนือจากรายการข้างต้น)</span>
              </label>

              {/* เมื่อติ๊กอื่นๆ ถึงจะแสดงกล่อง Input ให้พิมพ์ */}
              {hasOtherEquipment && (
                <div className="mt-2.5 pl-6.5 animate-fadeIn">
                  <Input
                    placeholder="ระบุอุปกรณ์อื่นๆ ที่ต้องการ หรือหมายเหตุเพิ่มเติม"
                    value={form.otherEquipment}
                    onChange={(e) => setForm({ ...form, otherEquipment: e.target.value })}
                    autoFocus
                  />
                </div>
              )}
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <div className="flex gap-2">
            <Button variant="neutral" onClick={() => { setError(''); setStep(2); }}>ย้อนกลับ</Button>
            <Button loading={loading} onClick={submit}>{isEdit ? 'บันทึกการแก้ไข' : 'ยืนยันการจอง'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
