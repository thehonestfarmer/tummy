import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { PinPad } from "@/components/PinPad";

export const dynamic = "force-dynamic";

/** The app's front door, and the installed app's start_url: straight to Today, ready to log. */
export default async function EnterPage() {
  if (await getUser()) redirect("/today");
  return <PinPad />;
}
