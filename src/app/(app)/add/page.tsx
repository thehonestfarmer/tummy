import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { StockUp } from "@/components/health/StockUp";

export const dynamic = "force-dynamic";

/** Stock up (healthspec.md §5.10): a whole shop into the fridge. */
export default async function StockUpPage() {
  if (!(await getUser())) redirect("/");
  return <StockUp />;
}
