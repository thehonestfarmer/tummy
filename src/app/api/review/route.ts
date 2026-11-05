import { after } from "next/server";
import { withUser } from "@/lib/api";
import {
  confirmDraft,
  discardDraft,
  getReviewQueue,
  mergeDraft,
  readDraft,
  resetDraft,
} from "@/lib/health/foods";

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(() => getReviewQueue());
}

type Body = { action?: string; id?: unknown; reading?: unknown; into?: unknown; reference?: unknown };

/** Every action returns the refreshed queue, so the screen just swaps it in. */
export async function POST(req: Request) {
  const { action, id, reading, into, reference } = (await req.json().catch(() => ({}))) as Body;

  return withUser(async (user) => {
    if (typeof id !== "number") throw new Error("Which draft?");
    switch (action) {
      case "confirm":
        await confirmDraft(user, id, reading, typeof reference === "number" ? reference : null);
        break;
      case "discard":
        await discardDraft(id);
        break;
      case "merge":
        if (typeof into !== "number") throw new Error("Same as which food?");
        await mergeDraft(id, into);
        break;
      case "retry":
        await resetDraft(id);
        after(() => readDraft(id));
        break;
      default:
        throw new Error("Unknown action.");
    }
    return getReviewQueue();
  });
}
