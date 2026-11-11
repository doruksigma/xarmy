export interface HistoricalDecision {
  id: string;
  eventId: string;
  initiator: string;
  recipient: string;
  stage: "initiate" | "respond";
  createdDay: number;
}
export interface HistoricalResolution {
  eventId: string;
  day: number;
  outcome: "accepted" | "declined" | "unavailable";
  by: string;
}
export interface HistoricalState {
  pending: HistoricalDecision[];
  resolved: HistoricalResolution[];
}
