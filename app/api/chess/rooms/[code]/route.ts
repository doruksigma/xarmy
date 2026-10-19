import { getRoom, roomResponse, roomToken } from "@/lib/chess-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return roomResponse(async () => {
    const { code } = await context.params;
    return { room: await getRoom(code, roomToken(request)) };
  });
}
