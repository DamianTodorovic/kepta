export function KeptaMark({ size = 32, radius = 9 }: { size?: number; radius?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="KEPTA Logo">
      <rect width="32" height="32" rx={radius} fill="#0f0f0f" />
      {/* K */}
      <path d="M11 9.5 V22.5 M11 16 L18.2 9.5 M11 16 L18.2 22.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21.2" cy="9.8" r="1.7" fill="white" />
    </svg>
  );
}

export function KeptaWordmark({ className }: { className?: string }) {
  return (
    <span className={className} style={{ fontWeight: 740, letterSpacing: '-0.03em', fontSize: '15px', lineHeight: 1, color: 'var(--text-1)' }}>
      KEPTA
    </span>
  );
}
