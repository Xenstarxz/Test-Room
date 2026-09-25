export default function UserAvatar({ avatar, name = '', size = 'md', className = '' }) {
  const sizeClasses = {
    xs: 'h-6 w-6 text-xs',
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-14 w-14 text-xl',
    xl: 'h-20 w-20 text-2xl',
  };

  const isImage = typeof avatar === 'string' && (avatar.startsWith('data:image') || avatar.startsWith('http') || avatar.startsWith('/'));

  const initial = (name || '').trim().charAt(0) || '👤';

  if (isImage) {
    return (
      <img
        src={avatar}
        alt={name || 'User Avatar'}
        className={`shrink-0 rounded-2xl object-cover shadow-xs border border-white/20 dark:border-slate-700 ${sizeClasses[size] || sizeClasses.md} ${className}`}
      />
    );
  }

  return (
    <div
      className={`shrink-0 flex items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-teal-500 font-black text-white shadow-xs border border-white/20 select-none ${sizeClasses[size] || sizeClasses.md} ${className}`}
    >
      {initial}
    </div>
  );
}
