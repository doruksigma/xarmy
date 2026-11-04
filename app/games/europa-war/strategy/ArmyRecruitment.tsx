"use client";
import { useMemo, useRef, useState } from "react";
import ActionPreview from "./ActionPreview";
import MilitaryIcon, { equipmentIcon, unitIcon } from "./MilitaryIcon";
import { EQUIPMENT, TECHNOLOGIES, UNITS } from "./catalog";
import {
  recruitmentLocationsIn,
  resolveRecruitmentProvince,
} from "./recruitment-location";
import { GEOGRAPHY } from "./world";
import { hasArmyCapacity } from "./campaign-limits";
import type { Action, Equipment, UnitType, World } from "./types";
import styles from "./ArmyRecruitment.module.css";

const format = (value: number) => Math.floor(value).toLocaleString("tr-TR");
const roles: Record<UnitType, string> = {
  infantry: "Yakıt istemeyen savunma birliği.",
  artillery: "Piyadeden yüksek saldırı gücü; daha yavaş ilerler.",
  motorized: "Hızlı kara intikali; kamyon ve yakıt kullanır.",
  mechanized: "Yüksek savunma; kamyon ve orta tank ekipmanı kullanır.",
  lightTank: "En hızlı tank türü; savunması ağır tanktan düşüktür.",
  mediumTank: "Saldırı, savunma ve hız arasında denge kurar.",
  heavyTank:
    "En yüksek temel saldırı ve savunma; yavaş ve yakıt tüketimi yüksek.",
  special: "Daha az askerle güçlü ve hızlı piyade.",
  mountain: "Dağlık arazide saldırı ve savunma avantajı.",
  paratrooper: "Gerekli hava koşulları sağlandığında hava indirme yapabilir.",
};

/** Spawn preference belongs to the campaign UI, never the clicked map region. */
export default function ArmyRecruitment({
  world,
  command,
  preferredProvince,
  onProvinceChange,
}: {
  world: World;
  command: (action: Action) => boolean | void;
  preferredProvince?: string | null;
  onProvinceChange: (province: string) => void;
}) {
  const country = world.countries[world.player];
  const provinces = world.provinces;
  const [unit, setUnit] = useState<UnitType>("infantry");
  const [typeChooserOpen, setTypeChooserOpen] = useState(false);
  const typeButton = useRef<HTMLButtonElement>(null);
  const locations = useMemo(
    () => recruitmentLocationsIn(provinces, country.id, country.capital),
    [provinces, country.id, country.capital],
  );
  const province = resolveRecruitmentProvince(world, preferredProvince);
  const definition = UNITS[unit];
  const cost = Object.entries(definition.equipment) as [Equipment, number][];
  const unlocked = !definition.tech || country.tech.includes(definition.tech);
  const research = TECHNOLOGIES.find(
    (tech) => tech.id === definition.tech,
  )?.name;
  const missingEquipment = cost.some(
    ([id, amount]) => country.equipment[id] < amount,
  );
  const unavailable = country.capitulated
    ? "Ülken teslim olduğu için eğitim başlatılamıyor."
    : !province
      ? "Eğitim için kendi kontrolündeki bir bölgeye ihtiyacın var."
      : !unlocked
        ? `Önce ${research ?? "ilgili teknolojiyi"} araştır.`
        : country.recruitment.length >= 6
          ? "Altı eğitim yuvası da dolu; bir tümenin tamamlanmasını bekle."
          : !hasArmyCapacity(world)
            ? "Seferin birlik kapasitesi dolu; eğitim için boş yer gerekiyor."
            : country.manpower < definition.men
              ? "Bu tümen için yedek insan gücü yetersiz."
              : missingEquipment
                ? "Aşağıdaki eksik ekipmanı Sanayi panelinde üret."
                : null;
  return (
    <section
      className={styles.section}
      data-testid="army-recruitment"
      aria-labelledby="army-recruitment-title"
    >
      <header>
        <MilitaryIcon name="infantry" size={26} />
        <div>
          <h3 id="army-recruitment-title">Yeni tümen eğit</h3>
          <small>Birlik türünü ve çıkacağı şehri buradan seç.</small>
        </div>
      </header>
      <label className={styles.location}>
        Birliklerin çıkacağı şehir
        <select
          aria-label="Birliklerin çıkacağı şehir"
          value={province ?? ""}
          disabled={!locations.length}
          onChange={(event) => onProvinceChange(event.target.value)}
        >
          {!locations.length && <option value="">Uygun bölge yok</option>}
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
              {location.capital ? " · Başkent" : ""}
            </option>
          ))}
        </select>
      </label>
      {preferredProvince && preferredProvince !== province && (
        <p className={styles.warning}>
          Önceki eğitim yeri artık uygun değil. Yeni emirler aşağıda seçili
          şehirde başlayacak.
        </p>
      )}
      {province !== country.capital &&
        locations.some((location) => location.capital) && (
          <button
            type="button"
            onClick={() => onProvinceChange(country.capital)}
          >
            Başkentte eğitim yap
          </button>
        )}
      <button
        ref={typeButton}
        type="button"
        className={styles.chooser}
        aria-label="Birlik türünü değiştir"
        aria-expanded={typeChooserOpen}
        aria-controls="recruitment-unit-types"
        onClick={() => setTypeChooserOpen((open) => !open)}
      >
        <MilitaryIcon name={unitIcon(unit)} size={24} />
        <span>
          <small>Seçili birlik türü</small>
          <strong>{definition.name}</strong>
        </span>
        <b>{typeChooserOpen ? "Kapat" : "Değiştir"}</b>
      </button>
      {typeChooserOpen && (
        <div
          id="recruitment-unit-types"
          className={styles.units}
          role="group"
          aria-label="Eğitilecek birlik türü"
        >
          {(Object.keys(UNITS) as UnitType[]).map((type) => {
            const item = UNITS[type];
            const locked = !!item.tech && !country.tech.includes(item.tech);
            return (
              <button
                type="button"
                key={type}
                aria-pressed={unit === type}
                aria-label={`${item.name} seç`}
                className={`${styles.unit} ${unit === type ? styles.selected : ""}`}
                onClick={() => {
                  setUnit(type);
                  setTypeChooserOpen(false);
                  typeButton.current?.focus();
                }}
              >
                <MilitaryIcon name={unitIcon(type)} size={24} />
                <strong>{item.name}</strong>
                <span>
                  {item.days} gün · {format(item.men)} asker
                </span>
                <small>
                  {locked
                    ? "Araştırma gerekli"
                    : `Saldırı ${item.attack} · Savunma ${item.defense}`}
                </small>
              </button>
            );
          })}
        </div>
      )}
      <div
        className={styles.quickCost}
        aria-label="Seçili tümenin eğitim özeti"
        data-testid="recruitment-training-summary"
      >
        <strong>
          {definition.days} gün · {format(definition.men)} asker
        </strong>
        <span>
          {cost
            .map(([id, amount]) => `${format(amount)} ${EQUIPMENT[id].name}`)
            .join(" · ")}
        </span>
      </div>
      {unavailable && (
        <p className={styles.warning} data-testid="recruitment-unavailable">
          {unavailable}
        </p>
      )}
      <button
        type="button"
        className={styles.train}
        disabled={!!unavailable}
        onClick={() => province && command({ type: "recruit", unit, province })}
      >
        <MilitaryIcon name={unitIcon(unit)} />
        Eğitime başla ·{" "}
        {province ? GEOGRAPHY[province].name : "Uygun bölge yok"}
      </button>
      <p className={styles.hint}>
        İlk seçim başkentindir. Haritada başka bir şehre dokunmak eğitim yerini
        değiştirmez. Mevcut eğitimlerin çıkış yeri korunur.
      </p>
      <div
        className={styles.specification}
        data-testid="recruitment-unit-stats"
      >
        <h4>
          <MilitaryIcon name={unitIcon(unit)} />
          {definition.name}
        </h4>
        <p>{roles[unit]}</p>
        <dl>
          <div>
            <dt>Saldırı</dt>
            <dd>{definition.attack}</dd>
          </div>
          <div>
            <dt>Savunma</dt>
            <dd>{definition.defense}</dd>
          </div>
          <div>
            <dt>Hız</dt>
            <dd>{definition.speed.toLocaleString("tr-TR")}×</dd>
          </div>
          <div>
            <dt>Temel yakıt</dt>
            <dd>{definition.fuel.toLocaleString("tr-TR")}</dd>
          </div>
        </dl>
        <p className={styles.hint}>
          Temel değerlerdir; arazi, araştırma, komutan ve ikmal muharebedeki
          sonucu değiştirir.
        </p>
        <ul className={styles.costs} aria-label="Tümen eğitim maliyeti">
          <li
            className={country.manpower < definition.men ? styles.warning : ""}
          >
            <MilitaryIcon name="manpower" />
            <span>İnsan gücü</span>
            <b>
              {format(definition.men)} / {format(country.manpower)}
            </b>
          </li>
          {cost.map(([id, amount]) => (
            <li
              key={id}
              className={country.equipment[id] < amount ? styles.warning : ""}
            >
              <MilitaryIcon name={equipmentIcon(id)} />
              <span>{EQUIPMENT[id].name}</span>
              <b>
                {format(amount)} / {format(country.equipment[id])}
              </b>
            </li>
          ))}
        </ul>
        <small className={styles.hint}>
          Gereken / eldeki stok. Eğitim başladığında kaynaklar ayrılır.
        </small>
      </div>
      {province && (
        <ActionPreview
          world={world}
          action={{ type: "recruit", unit, province }}
        />
      )}
      <h4>
        Eğitim kuyruğu <span>{country.recruitment.length}/6</span>
      </h4>
      {!country.recruitment.length && (
        <p className={styles.hint}>
          Henüz eğitim emri yok. Eğitim tamamlandığında tümen seçtiğin şehirde
          ortaya çıkar.
        </p>
      )}
      {country.recruitment.map((queued) => {
        const percent = Math.max(
          0,
          Math.min(100, (queued.progress / queued.total) * 100),
        );
        const paused =
          world.provinces[queued.province].controller !== country.id;
        return (
          <div
            className={styles.queued}
            key={queued.id}
            data-testid="recruitment-queue-item"
          >
            <strong>
              <MilitaryIcon name={unitIcon(queued.type)} />
              {UNITS[queued.type].name}
            </strong>
            <span>
              {GEOGRAPHY[queued.province].name} ·{" "}
              {Math.max(0, Math.ceil(queued.total - queued.progress))} gün kaldı
            </span>
            <div
              role="progressbar"
              aria-label={`${UNITS[queued.type].name} eğitimi`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.floor(percent)}
            >
              <i style={{ width: `${percent}%` }} />
            </div>
            {paused && (
              <small className={styles.warning}>
                Bölge kontrolümüzde değil; eğitim bekliyor.
              </small>
            )}
          </div>
        );
      })}
    </section>
  );
}
