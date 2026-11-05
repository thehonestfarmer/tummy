import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getLibrary } from "@/lib/health/foods";
import { BulkAdd } from "@/components/health/BulkAdd";

export const dynamic = "force-dynamic";

export default async function AddFoodsPage() {
  if (!(await getUser())) redirect("/");
  const { drafts } = await getLibrary();
  return <BulkAdd waiting={drafts} />;
}
