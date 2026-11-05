import { HealthToday } from "@/components/health/HealthToday";

export const dynamic = "force-dynamic";

/** The day itself comes from the Health layout, shared with the macro bar. */
export default function HealthTodayPage() {
  return <HealthToday />;
}
