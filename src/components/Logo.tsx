export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M6 12a8 8 0 0 1 8-8h12a8 8 0 0 1 8 8v8a8 8 0 0 1-8 8h-9l-6.4 5.6A1.2 1.2 0 0 1 8.6 32.7V28A8 8 0 0 1 6 22z"
        fill="#0066FF"
      />
      <circle className="logo-dot" style={{ animationDelay: "0s" }} cx="14.5" cy="16.5" r="2.4" fill="#66FF99" />
      <circle className="logo-dot" style={{ animationDelay: "0.2s" }} cx="21" cy="16.5" r="2.4" fill="#66FF99" />
      <circle className="logo-dot" style={{ animationDelay: "0.4s" }} cx="27.5" cy="16.5" r="2.4" fill="#66FF99" />
    </svg>
  );
}
