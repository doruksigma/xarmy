import { chooseBotMove, type BotRequest, type BotResponse } from "./bot";

// Keep the worker typed without adding webworker globals to the Next.js app.
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<BotRequest>) => void) | null;
  postMessage: (message: BotResponse) => void;
};

worker.onmessage = ({ data }) => {
  const response: BotResponse = { requestId: data.requestId, move: null };
  try {
    response.move = chooseBotMove(data.fen, data.difficulty);
  } catch {
    response.error =
      "Bot hamlesi hesaplanamadı. Lütfen oyunu yeniden başlatın.";
  }
  worker.postMessage(response);
};
