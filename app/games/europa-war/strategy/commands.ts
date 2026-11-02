import { applyCountryAction } from "./action-engine";
import { BUILDINGS, UNITS } from "./catalog";
import { GEOGRAPHY } from "./world";
import {
  canonicalAction,
  commandSequence,
  isValidProtocolCommand,
  COMMAND_HISTORY_MAX_CHARS,
  COMMAND_RECEIPT_LIMIT,
  COMMAND_SUMMARY_MAX_CHARS,
  COMMAND_TICKS_PER_DAY,
  type ProtocolCommand,
  type CommandReceipt,
} from "./command-types";
import type { Action, Arsenal, World } from "./types";

export type CommandCode =
  | "APPLIED"
  | "DUPLICATE"
  | "INVALID_COMMAND"
  | "UNAUTHORIZED"
  | "UNKNOWN_ISSUER"
  | "FUTURE_TICK"
  | "CONFLICT"
  | "STALE"
  | "OUT_OF_ORDER"
  | "RULE_REJECTED"
  | "READY";
export interface CommandResult {
  world: World;
  status: "applied" | "duplicate" | "rejected";
  code: CommandCode;
  message: string;
}
export interface CommandDeltas {
  treasury: number;
  political: number;
  manpower: number;
  equipment: Partial<Arsenal>;
}
export interface CommandPreview {
  eligible: boolean;
  code: CommandCode;
  message: string;
  deltas: CommandDeltas;
}
const labels: Record<Action["type"], string> = {
  commanderAutoAssign: "Otomatik komutan ataması",
  commanderDeploy: "Komutan sınır konuşlandırması",
  commanderStance: "Komutan görevi",
  commanderRecall: "Komutanı geri çağırma",
  commanderCreate: "Yeni komutan",
  difficulty: "Zorluk ayarı",
  automation: "Yardımcı yönetim ayarı",
  autoPlan: "Yardımcı yönetim planı",
  support: "Tümen destek bölüğü",
  offensive: "Taarruz planı",
  plan: "Plan yönetimi",
  createWing: "Hava kanadı kurma",
  wing: "Hava kanadı görevi",
  disbandWing: "Hava kanadını dağıtma",
  commission: "Gemi hizmete alma",
  ship: "Gemi görevi",
  carrierAircraft: "Uçak gemisi hava grubu",
  peaceClaim: "Barış konferansı talebi",
  peacePass: "Barış konferansında sıra geçme",
  release: "Bağımsızlık verme",
  cabinet: "Kabine ataması",
  decision: "Ulusal karar",
  front: "Cephe hattı",
  deleteFront: "Cephe hattını kaldırma",
  move: "Tümen hareketi",
  moveGroup: "Toplu tümen hareketi",
  halt: "Tümeni durdurma",
  haltGroup: "Tümen grubunu durdurma",
  general: "Komutan ataması",
  recruit: "Tümen eğitimi",
  build: "İnşaat emri",
  cancelBuild: "İnşaat iptali",
  production: "Üretim tahsisi",
  research: "Araştırma başlatma",
  focus: "Ulusal odak başlatma",
  economy: "Ekonomi yasası",
  conscription: "Askerlik yasası",
  advisor: "Danışman ataması",
  reform: "Siyasi reform",
  occupation: "İşgal yönetimi",
  diplomacy: "Diplomatik işlem",
  trade: "Kaynak ticareti",
  cancelTrade: "Ticareti iptal etme",
  air: "Hava görevi",
  navy: "Donanma görevi",
  paradrop: "Hava indirme",
  agency: "İstihbarat teşkilatı",
  trainAgent: "Ajan eğitimi",
  counterIntel: "Karşı istihbarat",
  mission: "İstihbarat operasyonu",
};
const emptyDeltas = (): CommandDeltas => ({
  treasury: 0,
  political: 0,
  manpower: 0,
  equipment: {},
});

/** Record human-readable targets now, so later captures/deletions cannot erase them. */
function describeAction(world: World, issuer: string, action: Action): string {
  const province = (id: string) => GEOGRAPHY[id]?.name ?? id;
  const commander = (id: string) =>
    world.countries[issuer].generals.find((general) => general.id === id)
      ?.name ?? id;
  let detail = "";
  switch (action.type) {
    case "build":
      detail = `${BUILDINGS[action.building].name} · ${province(action.province)}`;
      break;
    case "recruit":
      detail = `${UNITS[action.unit].name} · ${province(action.province)}`;
      break;
    case "moveGroup":
      detail = `${new Set(action.armies).size} tümen → ${province(action.to)}`;
      break;
    case "move":
    case "paradrop":
      detail = `${world.armies.find((army) => army.id === action.army)?.name ?? action.army} → ${province(action.to)}`;
      break;
    case "haltGroup":
      detail = `${new Set(action.armies).size} tümen`;
      break;
    case "front":
    case "offensive": {
      const targets =
        action.type === "front" ? action.provinces : action.objectives;
      detail = `${new Set(action.armies).size} tümen · ${province(targets[0])} → ${province(targets.at(-1)!)}`;
      break;
    }
    case "commanderDeploy":
      detail = `${commander(action.general)} → ${world.countries[action.target]?.name ?? action.target}`;
      break;
    case "commanderStance":
      detail = `${commander(action.general)} · ${action.stance === "attack" ? "Taarruz" : "Savunma"}`;
      break;
    case "commanderRecall":
      detail = commander(action.general);
      break;
  }
  const summary = detail
    ? `${labels[action.type]} · ${detail}`
    : labels[action.type];
  return summary.length <= COMMAND_SUMMARY_MAX_CHARS
    ? summary
    : `${summary.slice(0, COMMAND_SUMMARY_MAX_CHARS - 1)}…`;
}

/** Tick labels reserve 24 positions/day, but execution still occurs once per day. */
export function commandTick(world: World): number {
  return world.day * COMMAND_TICKS_PER_DAY;
}
export function createCommand(
  world: World,
  action: Action,
  issuerCountryId = world.player,
): ProtocolCommand {
  const cursor =
    world.commandState &&
    Object.hasOwn(world.commandState.cursors, issuerCountryId)
      ? world.commandState.cursors[issuerCountryId]
      : 0;
  return {
    commandId: `${issuerCountryId}:${cursor + 1}`,
    issuerCountryId,
    issuedTick: commandTick(world),
    action: structuredClone(action),
  };
}
function rejected(
  world: World,
  code: CommandCode,
  message: string,
): CommandResult {
  return { world, status: "rejected", code, message };
}
/** The trusted actor comes from the caller, never from an imported command. */
function checkCommand(
  world: World,
  input: unknown,
  actor: string,
): CommandResult | null {
  if (!isValidProtocolCommand(input))
    return rejected(
      world,
      "INVALID_COMMAND",
      "Emir biçimi veya parametreleri geçersiz.",
    );
  const command = input;
  if (command.issuerCountryId !== actor)
    return rejected(
      world,
      "UNAUTHORIZED",
      "Bu ülke adına emir verme yetkin yok.",
    );
  if (!Object.hasOwn(world.countries, actor))
    return rejected(world, "UNKNOWN_ISSUER", "Emri veren ülke bulunamadı.");
  const previous = world.commandState?.receipts.find(
    (r) => r.commandId === command.commandId,
  );
  if (previous) {
    if (
      previous.issuerCountryId !== command.issuerCountryId ||
      previous.issuedTick !== command.issuedTick ||
      canonicalAction(previous.action) !== canonicalAction(command.action)
    )
      return rejected(
        world,
        "CONFLICT",
        "Bu emir kimliği daha önce farklı bir içerikle kullanıldı.",
      );
    return {
      world,
      status: "duplicate",
      code: "DUPLICATE",
      message: "Emir daha önce uygulandı; yeniden kaynak harcanmadı.",
    };
  }
  const cursor =
    world.commandState && Object.hasOwn(world.commandState.cursors, actor)
      ? world.commandState.cursors[actor]
      : 0;
  const sequence = commandSequence(command.commandId, actor)!;
  if (sequence <= cursor)
    return rejected(
      world,
      "STALE",
      "Bu eski emir işlendi; ayrıntısı geçmişten çıkarılmış olsa da tekrar uygulanamaz.",
    );
  if (sequence !== cursor + 1)
    return rejected(
      world,
      "OUT_OF_ORDER",
      "Emir sırası uyuşmuyor; güncel sefer üzerinden tekrar emir ver.",
    );
  if (command.issuedTick > commandTick(world))
    return rejected(
      world,
      "FUTURE_TICK",
      "Gelecekteki bir güne ait emir uygulanamaz.",
    );
  return null;
}

export function executeCommand(
  world: World,
  command: unknown,
  trustedActorCountryId: string,
): CommandResult {
  const checked = checkCommand(world, command, trustedActorCountryId);
  if (checked) return checked;
  const valid = command as ProtocolCommand;
  const applied = applyCountryAction(
    world,
    valid.issuerCountryId,
    valid.action,
  );
  if (applied.error) return rejected(world, "RULE_REJECTED", applied.error);
  const state = applied.world.commandState ?? {
    version: 1 as const,
    cursors: {},
    receipts: [],
  };
  const receipt: CommandReceipt = {
    ...structuredClone(valid),
    sequence: commandSequence(valid.commandId, valid.issuerCountryId)!,
    appliedTick: commandTick(world),
    summary: describeAction(world, valid.issuerCountryId, valid.action),
  };
  state.cursors[valid.issuerCountryId] = receipt.sequence;
  state.receipts.push(receipt);
  let size = state.receipts.reduce(
    (total, r) => total + canonicalAction(r.action).length,
    0,
  );
  while (
    state.receipts.length > COMMAND_RECEIPT_LIMIT ||
    size > COMMAND_HISTORY_MAX_CHARS
  ) {
    size -= canonicalAction(state.receipts.shift()!.action).length;
  }
  applied.world.commandState = state;
  return {
    world: applied.world,
    status: "applied",
    code: "APPLIED",
    message: `${receipt.summary} uygulandı.`,
  };
}

/** Same authorization and domain rules as execution, without publishing a world or receipt. */
export function previewCommand(
  world: World,
  command: unknown,
  trustedActorCountryId: string,
): CommandPreview {
  const checked = checkCommand(world, command, trustedActorCountryId);
  if (checked)
    return {
      eligible: checked.status === "duplicate",
      code: checked.code,
      message: checked.message,
      deltas: emptyDeltas(),
    };
  const valid = command as ProtocolCommand;
  const candidate = applyCountryAction(
    world,
    valid.issuerCountryId,
    valid.action,
  );
  if (candidate.error)
    return {
      eligible: false,
      code: "RULE_REJECTED",
      message: candidate.error,
      deltas: emptyDeltas(),
    };
  const before = world.countries[valid.issuerCountryId],
    after = candidate.world.countries[valid.issuerCountryId];
  const deltas: CommandDeltas = {
    treasury: after.treasury - before.treasury,
    political: after.political - before.political,
    manpower: after.manpower - before.manpower,
    equipment: {},
  };
  for (const key of Object.keys(before.equipment) as (keyof Arsenal)[]) {
    const delta = after.equipment[key] - before.equipment[key];
    if (delta !== 0) deltas.equipment[key] = delta;
  }
  return {
    eligible: true,
    code: "READY",
    message: `${labels[valid.action.type]} uygulanabilir.`,
    deltas,
  };
}
export function previewAction(
  world: World,
  action: unknown,
  issuerCountryId = world.player,
): CommandPreview {
  // Validation precedes cloning: untrusted functions and malformed payloads cannot reach the engine.
  const cursor =
    world.commandState &&
    Object.hasOwn(world.commandState.cursors, issuerCountryId)
      ? world.commandState.cursors[issuerCountryId]
      : 0;
  return previewCommand(
    world,
    {
      commandId: `${issuerCountryId}:${cursor + 1}`,
      issuerCountryId,
      issuedTick: commandTick(world),
      action,
    },
    issuerCountryId,
  );
}
