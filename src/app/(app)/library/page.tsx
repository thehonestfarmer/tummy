import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getLibrary } from "@/lib/health/foods";
import { getFridge } from "@/lib/health/fridge";
import { LibraryClient } from "@/components/health/LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  if (!(await getUser())) redirect("/");
  const [library, fridge] = await Promise.all([getLibrary(), getFridge()]);
  return <LibraryClient initial={library} fridge={fridge.items} />;
}
