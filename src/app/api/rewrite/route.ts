import { POST as humanizePost } from "../humanize/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return humanizePost(request);
}
