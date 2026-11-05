import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getLibrary } from "@/lib/health/foods";
import { LibraryClient } from "@/components/health/LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  if (!(await getUser())) redirect("/");
  return <LibraryClient initial={await getLibrary()} />;
}
