type TracepadMarkProps = {
  className?: string;
  size?: number;
};

/** A T traced from a starting point to an open endpoint. Label its parent. */
export function TracepadMark({ className, size = 28 }: TracepadMarkProps) {
  return (
    <svg
      className={className ? `tracepad-mark ${className}` : "tracepad-mark"}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 7h21M16 7v14a5 5 0 0 0 5 5h2"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="7" r="3.2" fill="currentColor" />
      <circle cx="26" cy="26" r="3.2" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}
