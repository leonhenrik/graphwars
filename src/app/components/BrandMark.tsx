export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="brand-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.55" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      <path d="M3 24 C 11 4, 18 4, 24 24 S 37 44, 45 24" fill="none" stroke="url(#brand-grad)" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="3" cy="24" r="3.5" fill="#38bdf8" />
      <circle cx="45" cy="24" r="3.5" fill="#fb923c" />
    </svg>
  );
}
