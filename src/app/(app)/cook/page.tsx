import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Cook } from "@/components/health/Cook";

export const dynamic = "force-dynamic";

/** Cook (healthspec.md §5.12): ingredients into a dish that sits in the fridge. */
export default async function CookPage() {
  if (!(await getUser())) redirect("/");
  return <Cook />;
}
