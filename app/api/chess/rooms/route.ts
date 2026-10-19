import { checkRoomOrigin, createRoom, roomResponse } from "@/lib/chess-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return roomResponse(async () => {
    checkRoomOrigin(request);
    return createRoom();
  }, 201);
}
