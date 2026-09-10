import { useState, useRef, useEffect } from 'react';

export default function Tooltip({ text, title = 'คำแนะนำ', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <span className="relative inline-flex items-center" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        className="ml-1.5 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full bg-slate-200 text-[10px] font-extrabold text-slate-600 transition hover:bg-brand-500 hover:text-white dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-brand-500 dark:hover:text-white"
        aria-label="คำอธิบายเพิ่มเติม"
      >
        ?
      </button>

      {open && (
        <span className="absolute bottom-full left-1/2 z-[300] mb-2 w-56 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {title && <span className="mb-1 block font-bold text-brand-600 dark:text-brand-400">{title}</span>}
          <span>{text || children}</span>
          <span className="absolute top-full left-1/2 -ml-1.5 -mt-px border-4 border-transparent border-t-white dark:border-t-slate-800" />
        </span>
      )}
    </span>
  );
}
