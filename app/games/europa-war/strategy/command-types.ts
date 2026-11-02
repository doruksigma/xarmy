import type { Action } from "./types";

export const COMMAND_RECEIPT_LIMIT = 64;
export const COMMAND_ACTION_MAX_CHARS = 65_536;
export const COMMAND_HISTORY_MAX_CHARS = 131_072;
export const COMMAND_SUMMARY_MAX_CHARS = 500;
/** Commands currently execute on daily boundaries, not an hourly simulation. */
export const COMMAND_TICKS_PER_DAY = 24;

export interface ProtocolCommand {
  commandId: string;
  issuerCountryId: string;
  issuedTick: number;
  action: Action;
}
export interface CommandReceipt extends ProtocolCommand {
  sequence: number;
  appliedTick: number;
  summary: string;
}
export interface CommandState {
  version: 1;
  cursors: Record<string, number>;
  receipts: CommandReceipt[];
}

type Validator = (value: unknown) => boolean;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);
const safeId: Validator = (v) =>
  typeof v === "string" &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(v) &&
  !["__proto__", "prototype", "constructor"].includes(v);
const bool: Validator = (v) => typeof v === "boolean";
const integer: Validator = (v) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1e7;
const one =
  (...options: readonly string[]): Validator =>
  (v) =>
    typeof v === "string" && options.includes(v);
const ids: Validator = (v) =>
  Array.isArray(v) && v.length <= 2500 && v.every((id) => safeId(id));
const nullableId: Validator = (v) => v === null || safeId(v);
const equipment = one(
  "rifle",
  "artillery",
  "truck",
  "lightTank",
  "mediumTank",
  "heavyTank",
  "fighter",
  "bomber",
  "strategicBomber",
  "reconPlane",
  "transport",
  "carrierFighter",
  "ship",
  "destroyer",
  "battleship",
  "submarine",
  "carrier",
);
const units = one(
  "infantry",
  "artillery",
  "motorized",
  "mechanized",
  "lightTank",
  "mediumTank",
  "heavyTank",
  "special",
  "mountain",
  "paratrooper",
);
const buildings = one(
  "civil",
  "military",
  "dock",
  "infra",
  "rail",
  "hub",
  "refinery",
  "synthetic",
  "fort",
  "radar",
  "mine",
  "airfield",
  "antiAir",
);
const areas = one("economy", "research", "recruitment", "operations");
const airModels = one(
  "fighter",
  "bomber",
  "strategicBomber",
  "reconPlane",
  "transport",
  "carrierFighter",
);
const airMissions = one(
  "idle",
  "superiority",
  "support",
  "strategic",
  "recon",
  "transport",
  "naval",
);

function shape(
  required: Record<string, Validator>,
  optional: Record<string, Validator> = {},
): Validator {
  return (v) =>
    object(v) &&
    Object.keys(required).every(
      (key) => Object.hasOwn(v, key) && required[key](v[key]),
    ) &&
    Object.keys(v).every(
      (key) =>
        Object.hasOwn(required, key) ||
        (Object.hasOwn(optional, key) && optional[key](v[key])),
    );
}
const actionShape = (
  fields: Record<string, Validator> = {},
  optional: Record<string, Validator> = {},
) => shape({ type: (v) => typeof v === "string", ...fields }, optional);
/** Exhaustive keys force new Action variants to add a runtime boundary validator. */
const actionValidators: Record<Action["type"], Validator> = {
  commanderAutoAssign: actionShape({ enabled: bool }),
  commanderDeploy: actionShape({ general: safeId, target: safeId }),
  commanderStance: actionShape({
    general: safeId,
    stance: one("defend", "attack"),
  }),
  commanderRecall: actionShape({ general: safeId }),
  commanderCreate: actionShape(),
  difficulty: actionShape({ value: one("easy", "normal", "hard") }),
  automation: actionShape({ area: areas, enabled: bool }),
  autoPlan: actionShape({ area: areas }),
  support: actionShape(
    {
      army: safeId,
      support: one("artillery", "engineers", "logistics", "hospital", "recon"),
    },
    { remove: bool },
  ),
  offensive: actionShape({
    armies: ids,
    objectives: ids,
    stance: one("careful", "balanced", "aggressive"),
  }),
  plan: actionShape({ id: safeId, kind: one("start", "pause", "delete") }),
  createWing: actionShape({ model: airModels, count: integer, base: safeId }),
  wing: actionShape(
    { id: safeId, mission: airMissions, target: safeId },
    { base: safeId },
  ),
  disbandWing: actionShape({ id: safeId }),
  commission: actionShape({
    model: one("ship", "destroyer", "battleship", "submarine", "carrier"),
    port: safeId,
  }),
  ship: actionShape({
    id: safeId,
    mission: one("idle", "patrol", "raid", "escort"),
    zone: one("atlantic", "north", "baltic", "mediterranean", "black"),
  }),
  carrierAircraft: actionShape({ id: safeId, count: integer }),
  peaceClaim: actionShape({
    conference: safeId,
    province: safeId,
    kind: one("annex", "puppet", "liberate"),
  }),
  peacePass: actionShape({ conference: safeId }),
  release: actionShape({ country: safeId }),
  cabinet: actionShape({
    slot: one("economy", "military", "science"),
    id: safeId,
  }),
  decision: actionShape({ id: safeId }, { target: safeId }),
  front: actionShape({ provinces: ids, armies: ids }),
  deleteFront: actionShape({ id: safeId }),
  move: actionShape({ army: safeId, to: safeId }, { append: bool }),
  moveGroup: actionShape({ armies: ids, to: safeId }, { append: bool }),
  halt: actionShape({ army: safeId }),
  haltGroup: actionShape({ armies: ids }),
  general: actionShape({ army: safeId, general: nullableId }),
  recruit: actionShape({ unit: units, province: safeId }),
  build: actionShape({ building: buildings, province: safeId }),
  cancelBuild: actionShape({ id: safeId }),
  production: actionShape({ equipment, factories: integer }),
  research: actionShape({ id: safeId }),
  focus: actionShape({ id: safeId }),
  economy: actionShape({ law: one("civilian", "partial", "war") }),
  conscription: actionShape({ law: one("volunteer", "limited", "extensive") }),
  advisor: actionShape({ advisor: one("industry", "science", "army") }),
  reform: actionShape({
    ideology: one("democracy", "republic", "monarchy", "fascism", "communism"),
  }),
  occupation: actionShape({
    province: safeId,
    policy: one("civil", "garrison"),
  }),
  diplomacy: actionShape({
    target: safeId,
    kind: one(
      "improve",
      "justify",
      "war",
      "alliance",
      "pact",
      "access",
      "peace",
      "embargo",
      "aid",
      "annex",
      "puppet",
      "liberate",
    ),
  }),
  trade: actionShape({
    target: safeId,
    resource: one("iron", "steel", "oil", "aluminum", "rubber", "fuel"),
    amount: (v) =>
      typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1e7,
  }),
  cancelTrade: actionShape({ id: safeId }),
  air: actionShape({
    mission: one("idle", "superiority", "support", "strategic"),
    target: safeId,
  }),
  navy: actionShape({ mission: one("idle", "patrol", "raid"), target: safeId }),
  paradrop: actionShape({ army: safeId, to: safeId }),
  agency: actionShape(),
  trainAgent: actionShape(),
  counterIntel: actionShape(),
  mission: actionShape({
    target: safeId,
    mission: one(
      "intel",
      "sabotage",
      "propaganda",
      "plans",
      "resistance",
      "diplomacy",
      "coup",
    ),
  }),
};

export function canonicalAction(action: Action): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(action).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  );
}
export function isValidAction(value: unknown): value is Action {
  if (
    !object(value) ||
    typeof value.type !== "string" ||
    !Object.hasOwn(actionValidators, value.type)
  )
    return false;
  if (!actionValidators[value.type as Action["type"]](value)) return false;
  return canonicalAction(value as Action).length <= COMMAND_ACTION_MAX_CHARS;
}
export function commandSequence(
  commandId: string,
  issuerCountryId: string,
): number | null {
  if (!commandId.startsWith(`${issuerCountryId}:`)) return null;
  const text = commandId.slice(issuerCountryId.length + 1);
  if (!/^[1-9][0-9]{0,15}$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
const tick: Validator = (v) =>
  typeof v === "number" &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  v <= 36500 * COMMAND_TICKS_PER_DAY &&
  v % COMMAND_TICKS_PER_DAY === 0;
export function isValidProtocolCommand(
  value: unknown,
): value is ProtocolCommand {
  return (
    shape({
      commandId: (v) => typeof v === "string" && v.length <= 100,
      issuerCountryId: safeId,
      issuedTick: tick,
      action: isValidAction,
    })(value) &&
    commandSequence(
      (value as ProtocolCommand).commandId,
      (value as ProtocolCommand).issuerCountryId,
    ) !== null
  );
}
export function isValidCommandState(
  value: unknown,
  countryIds?: readonly string[],
  currentTick?: number,
): value is CommandState {
  if (
    !shape({
      version: (v) => v === 1,
      cursors: object,
      receipts: Array.isArray,
    })(value)
  )
    return false;
  const state = value as CommandState;
  const entries = Object.entries(state.cursors);
  if (
    entries.length > 60 ||
    entries.some(
      ([id, n]) =>
        !safeId(id) ||
        !Number.isSafeInteger(n) ||
        n < 1 ||
        (countryIds && !countryIds.includes(id)),
    )
  )
    return false;
  if (state.receipts.length > COMMAND_RECEIPT_LIMIT) return false;
  const seen = new Set<string>(),
    latest = new Map<string, number>();
  let size = 0,
    previousTick = 0;
  for (const receipt of state.receipts) {
    if (
      !shape({
        commandId: (v) => typeof v === "string" && v.length <= 100,
        issuerCountryId: safeId,
        issuedTick: tick,
        appliedTick: tick,
        sequence: (v) =>
          typeof v === "number" && Number.isSafeInteger(v) && v > 0,
        action: isValidAction,
        summary: (v) =>
          typeof v === "string" &&
          v.length > 0 &&
          v.length <= COMMAND_SUMMARY_MAX_CHARS,
      })(receipt)
    )
      return false;
    if (
      commandSequence(receipt.commandId, receipt.issuerCountryId) !==
        receipt.sequence ||
      !Object.hasOwn(state.cursors, receipt.issuerCountryId) ||
      receipt.sequence > state.cursors[receipt.issuerCountryId] ||
      receipt.sequence <= (latest.get(receipt.issuerCountryId) ?? 0) ||
      seen.has(receipt.commandId) ||
      receipt.appliedTick < receipt.issuedTick ||
      receipt.appliedTick < previousTick ||
      (currentTick !== undefined && receipt.appliedTick > currentTick)
    )
      return false;
    previousTick = receipt.appliedTick;
    seen.add(receipt.commandId);
    latest.set(receipt.issuerCountryId, receipt.sequence);
    size += canonicalAction(receipt.action).length;
    if (size > COMMAND_HISTORY_MAX_CHARS) return false;
  }
  return [...latest].every(
    ([issuer, sequence]) => state.cursors[issuer] === sequence,
  );
}
