import { checkRoomOrigin, createRoom, roomJson, roomResponse } from "@/lib/dot-front-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return roomResponse(async () => {
    checkRoomOrigin(request);
    const body = await roomJson(request);
    return createRoom(body.map);
  }, 201);
}
