import { THAI_MONTHS, toDateKey, formatThaiDate, todayKey } from '../../utils/date.js';

export default function Calendar({ selectedDate, onSelect, viewDate, onChangeMonth, maxDate = null }) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const selectedKey = toDateKey(selectedDate);
  const today = todayKey();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => onChangeMonth(-1)} aria-label="เดือนก่อนหน้า">‹</button>
        <span className="font-bold text-slate-700 dark:text-slate-200">{THAI_MONTHS[month]} {year + 543}</span>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => onChangeMonth(1)} aria-label="เดือนถัดไป">›</button>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-xs font-bold text-slate-400">
        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isPast = key < today;
          const isFutureLimit = Boolean(maxDate && key > maxDate);
          const isDisabled = isPast || isFutureLimit;
          const isSelected = key === selectedKey;
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(key)}
              title={isFutureLimit ? `เกินกำหนดจองล่วงหน้า` : undefined}
              className={`aspect-square rounded-full text-sm transition ${
                isSelected ? 'bg-brand-500 font-bold text-white shadow-md' :
                isToday ? 'border-2 border-accent-500 text-slate-700 dark:text-slate-200' :
                isDisabled ? 'cursor-default text-slate-300 dark:text-slate-600' :
                'hover:bg-cyan-100 dark:hover:bg-cyan-950'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm dark:bg-cyan-950/40">
        <strong>วันที่เลือก:</strong> {formatThaiDate(selectedKey)}
      </p>
    </div>
  );
}
