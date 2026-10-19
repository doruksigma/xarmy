import {
  checkRoomOrigin,
  resignRoom,
  roomResponse,
  roomToken,
} from "@/lib/chess-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return roomResponse(async () => {
    checkRoomOrigin(request);
    const { code } = await context.params;
    return { room: await resignRoom(code, roomToken(request)) };
  });
}
