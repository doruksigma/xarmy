import { actInRoom, checkRoomOrigin, getRoom, roomJson, roomResponse, roomToken } from "@/lib/dot-front-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, context: Context) {
  return roomResponse(async () => {
    const { code } = await context.params;
    return { room: await getRoom(code, roomToken(request)) };
  });
}

export async function POST(request: Request, context: Context) {
  return roomResponse(async () => {
    checkRoomOrigin(request);
    const { code } = await context.params;
    return { room: await actInRoom(code, roomToken(request), await roomJson(request)) };
  });
}
