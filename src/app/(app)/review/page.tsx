import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getReviewQueue } from "@/lib/health/foods";
import { ReviewClient } from "@/components/health/ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  if (!(await getUser())) redirect("/");
  return <ReviewClient initial={await getReviewQueue()} />;
}
