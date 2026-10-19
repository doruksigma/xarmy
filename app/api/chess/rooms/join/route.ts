import {
  checkRoomOrigin,
  joinRoom,
  roomJson,
  roomResponse,
} from "@/lib/chess-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return roomResponse(async () => {
    checkRoomOrigin(request);
    const body = await roomJson(request);
    return joinRoom(body.code);
  });
}
