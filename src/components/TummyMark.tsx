/**
 * Tummy's own mark: a dumbbell resting on a rice bowl, Bear's sage on
 * Bunny's rose. The same drawing as public/icons/icon.svg, cropped to the
 * drawing itself so it can sit on any screen without the icon's ground.
 */
export function TummyMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="108 130 296 264" className={className} aria-hidden>
      <g transform="translate(0 -46)">
        <g fill="none" stroke="var(--bunny)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="22">
          <path d="M128 282 H384" />
          <path d="M146 282 A110 110 0 0 0 366 282" />
          <path d="M222 420 H290" />
        </g>
        <g fill="var(--bear)">
          <rect x="148" y="190" width="38" height="74" rx="13" />
          <rect x="326" y="190" width="38" height="74" rx="13" />
        </g>
        <path d="M186 227 H326" fill="none" stroke="var(--bear)" strokeWidth="22" strokeLinecap="round" />
      </g>
    </svg>
  );
}
