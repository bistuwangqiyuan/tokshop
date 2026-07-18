import { NextResponse } from "next/server";

/** IndexNow key file: GET /indexnow/<key>.txt returns the key itself (protocol requirement). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const key = process.env.INDEXNOW_KEY || "";
  if (!key || file !== `${key}.txt`)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
