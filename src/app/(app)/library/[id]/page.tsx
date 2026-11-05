import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getFood } from "@/lib/health/foods";
import { FoodEditor } from "@/components/health/FoodEditor";

export const dynamic = "force-dynamic";

export default async function FoodPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) redirect("/");
  const { id } = await params;
  const food = /^\d+$/.test(id) ? await getFood(Number(id)) : null;
  if (!food) notFound();
  // Keyed so that saving, which refreshes this page, re-seeds the form from the server.
  return <FoodEditor key={JSON.stringify(food)} food={food} />;
}
