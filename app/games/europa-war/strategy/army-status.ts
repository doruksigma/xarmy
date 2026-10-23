import { UNITS } from "./catalog";
import { atWar, GEOGRAPHY } from "./world";
import type { Army, World } from "./types";

/** Describe the actual order, rather than presenting combat as a completed march. */
export function armyStatus(w: World, army: Army) {
  const attacking = w.battles.some(
    (battle) =>
      battle.attacker === army.country && battle.province === army.move?.to,
  );
  const defending = w.battles.some(
    (battle) =>
      battle.province === army.province &&
      atWar(w, army.country, battle.attacker),
  );
  if (attacking)
    return {
      label: "Çatışıyor",
      detail: `${GEOGRAPHY[army.move!.to].name} savunmasını kırmaya çalışıyor. Tümen, savunma kırılıp yolculuk tamamlandığında şehre girer.`,
    };
  if (defending)
    return {
      label: "Savunuyor",
      detail: `${GEOGRAPHY[army.province].name} saldırı altında; tümen savunma yapıyor.`,
    };
  if (army.move)
    return {
      label: "İlerliyor",
      detail: `${GEOGRAPHY[army.move.to].name} yönünde ilerliyor.`,
    };
  if (army.route.length)
    return {
      label: "Emir bekliyor",
      detail: `${GEOGRAPHY[army.route[0]].name} için hareket emri sırada. Zaman ilerlediğinde uygulanır.`,
    };
  const plan = w.plans.find(
    (p) => p.country === army.country && p.armies.includes(army.id),
  );
  if (
    plan &&
    !plan.objectives.some((id) =>
      atWar(w, army.country, w.provinces[id].controller),
    )
  )
    return {
      label: "Hedef kalmadı",
      detail:
        "Planın hedefleri artık düşman kontrolünde değil. Yeni bir taarruz için yeni hedefler seç.",
    };
  if (plan && !plan.active)
    return {
      label: plan.preparation >= 30 ? "Plan hazır" : "Hazırlanıyor",
      detail:
        plan.preparation >= 30
          ? "Taarruz planı beklemede. İlerlemek için planı başlat."
          : `Taarruz hazırlığı %${Math.floor(plan.preparation)}. Zamanı ilerlet; en az %30 hazırlıkla planı başlatabilirsin.`,
    };
  if (
    plan &&
    (army.organization < 25 || army.strength < 30 || army.supply < 0.25)
  )
    return {
      label: "Toparlanıyor",
      detail:
        "Taarruz planı birliğin toparlanmasını bekliyor. İkmal ve takviye sağla; uygun duruma gelince plan devam eder.",
    };
  if (plan)
    return {
      label: "Plan bekliyor",
      detail:
        "Taarruz için açık rota ve uygun kuvvet dengesi bekleniyor. Planın hedeflerini ve yaklaşımını incele.",
    };
  if (army.organization < 10 || army.strength < 15)
    return {
      label: "Toparlanıyor",
      detail:
        "Birlik yıpranmış. İkmal, yedek asker ve ekipman sağla; toparlandığında yeniden saldırı emri ver.",
    };
  if (army.supply < 0.25)
    return {
      label: "İkmal kesik",
      detail: "İkmal hattını aç veya birliği ikmal merkezine yaklaştır.",
    };
  return { label: "Hazır", detail: "Yeni hareket veya saldırı emri bekliyor." };
}

export function armyMovementWarnings(w: World, army: Army) {
  const warnings: string[] = [];
  if (army.supply < 0.25)
    warnings.push("İkmal çok düşük; birlik yıpranıyor ve hareketi yavaşlıyor.");
  if (UNITS[army.type].fuel && w.countries[army.country].stock.fuel <= 0)
    warnings.push(
      "Yakıt yok; motorlu birliğin hareketi ve savaş gücü azalıyor.",
    );
  return warnings;
}
