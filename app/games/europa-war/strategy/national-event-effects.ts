import {
  BUILDINGS,
  EQUIPMENT,
  IDEOLOGIES,
  RESOURCES,
  TECHNOLOGIES,
} from "./catalog";
import { historicalEvent } from "./historical-catalog";
import { startCivilWar } from "./civil-war";
import { diplomaticAction } from "./diplomacy";
import {
  clamp,
  controlled,
  dateOf,
  event,
  GEOGRAPHY,
  requireRule,
} from "./world";
import type { Country, Ideology, World } from "./types";
import type { NationalEffect, NationalProgramme } from "./national-event-types";

const researchLength = (w: World, technology: string) => {
  const definition = TECHNOLOGIES.find((item) => item.id === technology)!;
  return Math.round(
    definition.days *
      (1 + Math.max(0, definition.year - dateOf(w.day).getUTCFullYear()) * 0.5),
  );
};
const ownLands = (w: World, c: Country) =>
  controlled(w, c.id).filter((province) => province.owner === c.id);
const researchSlots = (c: Country) =>
  1 +
  (c.population >= 20000000 ? 1 : 0) +
  (c.focuses.includes("science") || c.focuses.includes("officers") ? 1 : 0);

/** Victory is a real civil-war result, not a completed political focus alone. */
export function nationalCivilWarVictory(w: World, c: Country): boolean {
  const rebel = w.countries[`${c.id}-rebels`];
  const rebellionChosen = w.historical?.resolved.some(
    (item) =>
      item.outcome === "accepted" &&
      historicalEvent(item.eventId)?.country === c.id &&
      historicalEvent(item.eventId)?.domestic?.effects.some(
        (effect) => effect.kind === "uprising",
      ),
  );
  if (!rebellionChosen || !rebel?.capitulated || c.capitulated) return false;
  const remaining = Object.values(w.provinces).filter(
    (province) => province.owner === rebel.id,
  );
  if (remaining.length) {
    if (
      rebel.victor !== c.id ||
      remaining.some((province) => province.controller !== c.id)
    )
      return false;
    if (
      w.conferences.some(
        (conference) =>
          conference.status === "open" &&
          conference.defeated === rebel.id &&
          (conference.participants.length !== 1 ||
            conference.participants[0] !== c.id),
      )
    )
      return false;
  } else {
    // A conference may already have annexed the rebels. Retaining all home
    // regions prevents a foreign victor from unlocking imperial restoration.
    const home = Object.values(w.provinces).filter(
      (province) => GEOGRAPHY[province.id].country === c.id,
    );
    if (
      !home.length ||
      home.some(
        (province) => province.owner !== c.id || province.controller !== c.id,
      )
    )
      return false;
  }
  return true;
}
function setGovernment(
  c: Country,
  ideology: Ideology,
  name?: string,
  leader?: string,
) {
  c.ideology = ideology;
  for (const party of Object.keys(c.parties) as Ideology[])
    c.parties[party] = party === ideology ? 80 : 5;
  if (name) c.name = name;
  c.leader = leader ?? `${IDEOLOGIES[ideology]} hükûmeti`;
}

function buildingDestination(
  w: World,
  c: Country,
  effect: Extract<NationalEffect, { kind: "building" }>,
  counts = new Map<string, number>(),
) {
  const maximum = BUILDINGS[effect.building].max;
  const count = (id: string) =>
    counts.get(`${id}:${effect.building}`) ??
    w.provinces[id].buildings[effect.building];
  return ownLands(w, c)
    .filter(
      (province) =>
        (effect.location !== "capital" || province.id === c.capital) &&
        (effect.location !== "port" || GEOGRAPHY[province.id].port) &&
        (effect.building !== "dock" || GEOGRAPHY[province.id].port) &&
        count(province.id) + effect.amount <= maximum,
    )
    .sort((a, b) => count(a.id) - count(b.id) || a.id.localeCompare(b.id))[0];
}

/** Pure checks are reused when paying for a focus and when accepting its result.
 * All programme costs are paid only on acceptance; failed choices remain atomic. */
export function nationalProgrammeProblem(
  w: World,
  c: Country,
  programme: NationalProgramme,
): string | null {
  const requirements = programme.requirements;
  if (c.capitulated)
    return "Teslim olmuş yönetim bu ulusal programı uygulayamaz.";
  if (requirements?.independent && c.subjectOf)
    return "Bu siyasi yol için bağımsızlık gerekir.";
  if (
    requirements?.peace &&
    c.wars.length &&
    !(
      requirements.civilWarVictory &&
      nationalCivilWarVictory(w, c) &&
      c.wars.every((id) => id === `${c.id}-rebels`)
    )
  )
    return "Bu ulusal program barış dönemi gerektirir.";
  if (requirements?.ideologies && !requirements.ideologies.includes(c.ideology))
    return "Mevcut hükûmet bu siyasi yolun önkoşulunu karşılamıyor.";
  if (
    requirements?.minStability !== undefined &&
    c.stability < requirements.minStability
  )
    return `En az %${requirements.minStability} istikrar gerekir.`;
  if (requirements?.tech?.some((id) => !c.tech.includes(id)))
    return "Önce bu programın gerekli teknolojilerini araştırmalısın.";
  if (requirements?.noCivilWar && w.countries[`${c.id}-rebels`])
    return "Bu ülkede iç savaş yolu zaten başlatılmış.";
  if (requirements?.civilWarVictory && !nationalCivilWarVictory(w, c))
    return "Önce iç savaşı kazanıp isyancı topraklarını geri almalısın.";
  const cost = programme.costs;
  if (c.treasury < (cost?.treasury ?? 0))
    return `Programın uygulanması için ${cost!.treasury} hazine gerekir.`;
  for (const [resource, amount] of Object.entries(cost?.stock ?? {}))
    if (c.stock[resource as keyof typeof c.stock] < amount)
      return `Program için ${amount} ${RESOURCES[resource as keyof typeof RESOURCES]} kaynağı gerekir.`;
  for (const [equipment, amount] of Object.entries(cost?.equipment ?? {}))
    if (c.equipment[equipment as keyof typeof c.equipment] < amount)
      return `Program için ${amount} ${EQUIPMENT[equipment as keyof typeof EQUIPMENT].name} ekipmanı gerekir.`;
  const stock = { ...c.stock },
    equipment = { ...c.equipment };
  for (const [key, amount] of Object.entries(cost?.stock ?? {}))
    stock[key as keyof typeof stock] -= amount;
  for (const [key, amount] of Object.entries(cost?.equipment ?? {}))
    equipment[key as keyof typeof equipment] -= amount;
  let treasury = c.treasury - (cost?.treasury ?? 0),
    science = c.science;
  const counts = new Map<string, number>();
  const projects = new Map(
      c.research.map((project) => [project.id, { ...project }]),
    ),
    tech = new Set(c.tech);
  for (const effect of programme.effects) {
    if (effect.kind === "science")
      science = clamp(science + effect.amount, 0, 10);
    if (effect.kind === "building") {
      const province = buildingDestination(w, c, effect, counts);
      if (!province)
        return `${BUILDINGS[effect.building].name} için uygun, sana ait ve kapasitesi olan bir bölge yok.`;
      const key = `${province.id}:${effect.building}`;
      counts.set(
        key,
        (counts.get(key) ?? province.buildings[effect.building]) +
          effect.amount,
      );
    }
    if (effect.kind === "stock") {
      stock[effect.resource] += effect.amount;
      if (stock[effect.resource] < 0 || stock[effect.resource] > 1e9)
        return "Program kaynak deposunun kapasitesini aşıyor.";
    }
    if (effect.kind === "equipment") {
      equipment[effect.equipment] += effect.amount;
      if (equipment[effect.equipment] < 0 || equipment[effect.equipment] > 1e9)
        return "Program ekipman deposunun kapasitesini aşıyor.";
    }
    if (effect.kind === "treasury") {
      treasury += effect.amount;
      if (treasury < 0 || treasury > 1e9)
        return "Program hazine sınırlarını aşıyor.";
    }
    if (effect.kind === "research") {
      const definition = TECHNOLOGIES.find(
        (item) => item.id === effect.technology,
      );
      if (!definition) return "Programın araştırma teknolojisi bulunamadı.";
      if (tech.has(definition.id)) {
        if (effect.ifKnown === undefined)
          return `${definition.name} zaten araştırıldı; aynı ilerleme ikinci kez satın alınamaz.`;
        science += effect.ifKnown;
        if (science > 10)
          return "Araştırma kurumu katsayısı en yüksek seviyede.";
        continue;
      }
      if (definition.requires.some((id) => !tech.has(id)))
        return `${definition.name} için önce bağlantılı teknolojileri araştırmalısın.`;
      if (!projects.has(definition.id) && projects.size >= researchSlots(c))
        return "Programın araştırmasını başlatmak için boş araştırma yuvası gerekir.";
      const project = projects.get(definition.id) ?? {
        id: definition.id,
        progress: 0,
        total: researchLength(w, definition.id),
      };
      project.progress += effect.progress;
      if (project.progress >= project.total) {
        projects.delete(project.id);
        tech.add(project.id);
      } else projects.set(project.id, project);
    }
    if (
      effect.kind === "training" &&
      !w.armies.some(
        (army) =>
          army.country === c.id &&
          (army.experience < 100 || army.organization < 100),
      )
    )
      return "Eğitim verilebilecek bir tümen bulunamadı.";
    if (effect.kind === "uprising") {
      if (c.subjectOf || c.wars.length)
        return "İsyan yolu bağımsız ve barışta bir ülke gerektirir.";
      if (c.id.endsWith("-rebels") || w.countries[`${c.id}-rebels`])
        return "Bu ülkede yeni bir iç savaş başlatılamaz.";
      if (ownLands(w, c).length < 3)
        return "İç savaş için en az üç kendi bölgeni kontrol etmelisin.";
      if (effect.government === effect.opposition)
        return "İsyanın iki farklı siyasi tarafı olmalı.";
    }
    if (effect.kind === "restoration" && !nationalCivilWarVictory(w, c))
      return "İmparatorluğu ilan etmeden önce iç savaşı gerçekten kazanmalısın.";
  }
  return null;
}

export function applyNationalProgramme(
  w: World,
  c: Country,
  programme: NationalProgramme,
): void {
  const blocked = nationalProgrammeProblem(w, c, programme);
  requireRule(!blocked, blocked ?? "Ulusal program uygulanamıyor.");
  c.treasury -= programme.costs?.treasury ?? 0;
  for (const [key, amount] of Object.entries(programme.costs?.stock ?? {}))
    c.stock[key as keyof typeof c.stock] -= amount;
  for (const [key, amount] of Object.entries(programme.costs?.equipment ?? {}))
    c.equipment[key as keyof typeof c.equipment] -= amount;
  for (const effect of programme.effects) {
    if (effect.kind === "building")
      buildingDestination(w, c, effect)!.buildings[effect.building] +=
        effect.amount;
    if (effect.kind === "stock") c.stock[effect.resource] += effect.amount;
    if (effect.kind === "equipment")
      c.equipment[effect.equipment] += effect.amount;
    if (effect.kind === "treasury") c.treasury += effect.amount;
    if (
      [
        "stability",
        "warSupport",
        "exhaustion",
        "political",
        "science",
      ].includes(effect.kind)
    ) {
      const bounded = effect as Extract<
        NationalEffect,
        {
          kind:
            | "treasury"
            | "stability"
            | "warSupport"
            | "exhaustion"
            | "political"
            | "science";
        }
      >;
      const key = bounded.kind;
      c[key] = clamp(
        c[key] + bounded.amount,
        0,
        key === "science" ? 10 : key === "political" ? 500 : 100,
      );
    }
    if (effect.kind === "party") {
      const before = c.parties[effect.ideology],
        after = clamp(before + effect.amount);
      for (const id of Object.keys(c.parties) as Ideology[])
        if (id !== effect.ideology)
          c.parties[id] =
            100 - before > 0
              ? (c.parties[id] * (100 - after)) / (100 - before)
              : (100 - after) / 4;
      c.parties[effect.ideology] = after;
    }
    if (effect.kind === "government")
      setGovernment(c, effect.ideology, effect.name, effect.leader);
    if (effect.kind === "training")
      for (const army of w.armies)
        if (army.country === c.id) {
          army.experience = clamp(army.experience + effect.experience);
          army.organization = clamp(army.organization + effect.organization);
        }
    if (effect.kind === "research") {
      if (c.tech.includes(effect.technology) && effect.ifKnown !== undefined) {
        c.science += effect.ifKnown;
        continue;
      }
      let project = c.research.find((item) => item.id === effect.technology);
      if (!project) {
        project = {
          id: effect.technology,
          progress: 0,
          total: researchLength(w, effect.technology),
        };
        c.research.push(project);
      }
      project.progress += effect.progress;
      if (project.progress >= project.total) {
        c.tech.push(project.id);
        c.research = c.research.filter((item) => item.id !== project!.id);
        event(
          w,
          `${TECHNOLOGIES.find((item) => item.id === project!.id)!.name} araştırması tamamlandı.`,
        );
      }
    }
    if (effect.kind === "uprising") {
      setGovernment(
        c,
        effect.government,
        undefined,
        c.id === "germany" ? "Geçici ulusal konsey" : "Geçici yönetim",
      );
      startCivilWar(w, c.id, false, effect.opposition);
      const rebel = w.countries[`${c.id}-rebels`];
      requireRule(rebel, "İç savaş için karşı yönetim kurulamadı.");
      if (c.id === "germany") {
        c.name = "Alman Geçici Yönetimi";
        rebel.name = "Alman Rejim Kuvvetleri";
        rebel.leader = "Eski rejim askerî konseyi";
      }
    }
    if (effect.kind === "restoration") {
      const rebel = w.countries[`${c.id}-rebels`];
      if (
        rebel.victor === c.id &&
        Object.values(w.provinces).some(
          (province) => province.owner === rebel.id,
        )
      )
        diplomaticAction(w, c, rebel.id, "annex");
      setGovernment(c, "monarchy", effect.name, effect.leader);
    }
  }
}
