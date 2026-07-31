import { NextResponse } from "next/server";
import { answer } from "@/lib/rag";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { query, markets } = await req.json().catch(() => ({ query: "", markets: [] }));
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }
  const result = await answer(query, Array.isArray(markets) ? markets : []);
  return NextResponse.json(result);
}
