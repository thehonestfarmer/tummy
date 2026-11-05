import type { Slug } from "@/lib/config";

/**
 * The two identity marks. Quiet enough to sit beside any photograph, and
 * distinct in silhouette so a glance tells you whose side you're looking at.
 */
export function Mark({ slug, className = "" }: { slug: Slug; className?: string }) {
  const stroke = slug === "bunny" ? "var(--bunny)" : "var(--bear)";
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke={stroke}>
      {slug === "bunny" ? (
        <>
          <path d="M9 10.5C8 8 7.6 5 8.6 3.4c.9-1.4 2.2-.6 2.6 1.2.3 1.5.3 3.6 0 5.4" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M15 10.5c1-2.5 1.4-5.5.4-7.1-.9-1.4-2.2-.6-2.6 1.2-.3 1.5-.3 3.6 0 5.4" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="16" r="5.2" strokeWidth="1.6" />
        </>
      ) : (
        <>
          <circle cx="6.4" cy="7.4" r="3" strokeWidth="1.6" />
          <circle cx="17.6" cy="7.4" r="3" strokeWidth="1.6" />
          <circle cx="12" cy="15" r="6.6" strokeWidth="1.6" />
        </>
      )}
    </svg>
  );
}

export function markColor(slug: Slug) {
  return slug === "bunny" ? "var(--bunny)" : "var(--bear)";
}
