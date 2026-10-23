"use client";
import CommandCenter from "./CommandCenter";
import {
  AirNavalPanel,
  ArmyTools,
  CabinetPanel,
  PeacePanel,
} from "./AdvancedPanels";
import { tradeRoute } from "./trade-routes";
import type { OffensivePlan } from "./types";
import { useMemo, useState } from "react";
import {
  BUILDINGS,
  EQUIPMENT,
  focusTree,
  IDEOLOGIES,
  MISSIONS,
  RESOURCES,
  TECHNOLOGIES,
  TERRAINS,
  UNITS,
} from "./catalog";
import { CONSCRIPTION, ECONOMIES } from "./economy";
import { diplomaticAcceptance } from "./diplomacy";
import { airPower, intelChance } from "./operations";
import { researchDays, researchSlots } from "./politics";
import { armyMovementWarnings, armyStatus } from "./army-status";
import {
  capacity,
  controlled,
  dateLabel,
  GEOGRAPHY,
  MAP,
  localSupply,
  militaryPower,
  navalPower,
  surrender,
} from "./world";
import type {
  Action,
  Building,
  Country,
  Equipment,
  Ideology,
  Resource,
  UnitType,
  World,
} from "./types";
import styles from "../europa.module.css";

export const TABS = [
  ["command", "◈", "Komuta"],
  ["province", "⌖", "Bölge"],
  ["army", "⚑", "Ordu"],
  ["economy", "▥", "Sanayi"],
  ["diplomacy", "⚐", "Diplomasi"],
  ["research", "⌬", "Araştırma"],
  ["politics", "✦", "Siyaset"],
  ["operations", "◉", "Harekât"],
  ["saves", "▣", "Kayıtlar"],
] as const;
export type Tab = (typeof TABS)[number][0];
export const number = (n: number) => Math.floor(n).toLocaleString("tr-TR");
export function Meter({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <div className={styles.meter}>
      <span>
        {label}
        <b>%{Math.round(value)}</b>
      </span>
      <i>
        <em
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            background: color,
          }}
        />
      </i>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Progress({ value, total }: { value: number; total: number }) {
  const percent = Math.max(0, Math.min(100, (value / total) * 100));
  return (
    <div className={styles.progress}>
      <i style={{ width: `${percent}%` }} />
      <span>%{Math.floor(percent)}</span>
    </div>
  );
}
function Chart({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values),
    min = Math.min(0, ...values);
  return (
    <div className={styles.chart}>
      <small>{label}</small>
      {values.length > 1 ? (
        <svg
          viewBox="0 0 300 66"
          role="img"
          aria-label={`${label}: ${number(values.at(-1) ?? 0)}`}
        >
          <path
            d={`M0 64 ${values.map((v, i) => `L${(i / (values.length - 1)) * 300} ${60 - ((v - min) / (max - min)) * 52}`).join(" ")} L300 64Z`}
            fill="#a2b69315"
          />
          <polyline
            points={values
              .map(
                (v, i) =>
                  `${(i / (values.length - 1)) * 300},${60 - ((v - min) / (max - min)) * 52}`,
              )
              .join(" ")}
            fill="none"
            stroke="#b9c59b"
            strokeWidth="2"
          />
        </svg>
      ) : (
        <p>Haftalık veriler zaman ilerledikçe birikecek.</p>
      )}
    </div>
  );
}
interface Props {
  world: World;
  tab: Tab;
  selected: string;
  armyId: string | null;
  armyIds: string[];
  target: string;
  onTarget: (id: string) => void;
  command: (a: Action) => void;
  onProvince: (id: string) => void;
  onArmy: (id: string) => void;
  onArmies: (ids: string[], append?: boolean) => void;
  onOrder: () => void;
  onParadrop: () => void;
  onFront: () => void;
  onTab: (tab: Tab) => void;
  onOffensive: (armies: string[], stance: OffensivePlan["stance"]) => void;
}
export default function WarPanels({
  world: w,
  tab,
  selected,
  armyId,
  armyIds,
  target,
  onTarget,
  command,
  onProvince,
  onArmy,
  onArmies,
  onOrder,
  onParadrop,
  onFront,
  onTab,
  onOffensive,
}: Props) {
  const c = w.countries[w.player],
    p = w.provinces[selected],
    geo = GEOGRAPHY[selected],
    owner = w.countries[p.controller],
    a = w.armies.find((a) => a.id === armyId && a.country === c.id),
    t = w.countries[target] ?? w.countries.germany;
  const [unit, setUnit] = useState<UnitType>("infantry"),
    [building, setBuilding] = useState<Building>("civil"),
    [tradeResource, setTradeResource] = useState<Resource>("oil"),
    [branch, setBranch] = useState("Tümü"),
    [armySearch, setArmySearch] = useState(""),
    [armyPage, setArmyPage] = useState(0);
  const own = useMemo(
    () => w.armies.filter((a) => a.country === c.id),
    [w.armies, c.id],
  );
  const selection = useMemo(() => new Set(armyIds), [armyIds]);
  const selectedArmies = own.filter((a) => selection.has(a.id)),
    selectedIds = selectedArmies.map((a) => a.id),
    colocated = own.filter((unit) => unit.province === (a?.province ?? p.id)),
    hasIntel =
      t.id === c.id ||
      (c.intel[t.id]?.expires > w.day && c.intel[t.id].level >= 50) ||
      c.allies.includes(t.id);
  const roster = useMemo(() => {
    const query = armySearch.trim().toLocaleLowerCase("tr-TR");
    return query
      ? own.filter((army) =>
          `${army.name} ${GEOGRAPHY[army.province].name} ${UNITS[army.type].name}`
            .toLocaleLowerCase("tr-TR")
            .includes(query),
        )
      : own;
  }, [own, armySearch]);
  const pageSize = 40,
    pageCount = Math.max(1, Math.ceil(roster.length / pageSize)),
    page = Math.min(armyPage, pageCount - 1);
  const targetSelect = (
    <label className={styles.field}>
      Hedef ülke
      <select value={target} onChange={(e) => onTarget(e.target.value)}>
        {Object.values(w.countries)
          .filter((t) => t.id !== c.id)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.capitulated ? " · teslim oldu" : ""}
            </option>
          ))}
      </select>
    </label>
  );
  if (tab === "command")
    return <CommandCenter world={w} command={command} onTab={onTab} />;
  if (tab === "province")
    return (
      <>
        <div className={styles.eyebrow}>EYÂLET İSTİHBARATI</div>
        <h2>{geo.name}</h2>
        <p className={styles.subtitle}>
          {owner.flag} {owner.name} · {TERRAINS[geo.terrain].name}
          {geo.port ? " · ⚓ Liman" : ""}
          {geo.river ? " · Nehir / boğaz geçişi" : ""}
        </p>
        <div className={styles.statsGrid}>
          <Stat label="Nüfus" value={number(geo.population)} />
          <Stat
            label="Zafer puanı"
            value={`${geo.vp}${owner.capital === p.id ? " ★" : ""}`}
          />
          <Stat
            label="Sivil / askerî"
            value={`${p.buildings.civil} / ${p.buildings.military}`}
          />
          <Stat
            label="Altyapı / demiryolu"
            value={`${p.buildings.infra} / ${p.buildings.rail}`}
          />
        </div>
        <Meter value={p.damage} label="Tesis hasarı" color="#c78369" />
        {p.controller === c.id && (
          <Meter
            value={localSupply(w, c.id, p.id) * 100}
            label="İkmal kapasitesi"
          />
        )}
        <div className={styles.card}>
          <h3>Arazinin etkisi</h3>
          <p>
            Saldırı ×{TERRAINS[geo.terrain].attack} · Savunma ×
            {TERRAINS[geo.terrain].defense} · Hareket ×
            {TERRAINS[geo.terrain].speed}
          </p>
          <p>
            {geo.river ? "Geçişte saldıran birlikler %20 ceza alır. " : ""}
            {geo.terrain === "mountain"
              ? "Dağ komandoları burada avantajlıdır."
              : ""}{" "}
            Tahkimat seviyesi: {p.buildings.fort}.
          </p>
        </div>
        <details className={styles.fold}>
          <summary>Komşu şehirler · {geo.neighbors.length}</summary>
          <p>
            {geo.neighbors
              .map(
                (edge) =>
                  `${GEOGRAPHY[edge.id].name}${edge.sea ? " (deniz)" : ""}`,
              )
              .join(" · ")}
          </p>
          <p className={styles.hint}>
            Her şehrin kendi sınırı vardır. Bu şehri ele geçirmek komşu
            şehirlerin kontrolünü değiştirmez.
          </p>
        </details>
        <h3>Yeraltı kaynakları</h3>
        <div className={styles.chips}>
          {Object.entries(geo.resources)
            .filter(([, v]) => v > 0)
            .map(([r, v]) => (
              <span key={r}>
                {RESOURCES[r as Resource]} <b>{v}</b>
              </span>
            ))}
        </div>
        {p.owner !== p.controller && (
          <div className={styles.card}>
            <h3>İşgal yönetimi</h3>
            <p>Asıl ülke: {w.countries[p.owner].name}</p>
            <Meter value={p.resistance} label="Direniş" color="#c78369" />
            <Meter value={p.compliance} label="Uyum" />
            {p.controller === c.id && (
              <>
                <div className={styles.buttonRow}>
                  <button
                    className={p.occupation === "civil" ? styles.active : ""}
                    onClick={() =>
                      command({
                        type: "occupation",
                        province: p.id,
                        policy: "civil",
                      })
                    }
                  >
                    Sivil yönetim
                  </button>
                  <button
                    className={p.occupation === "garrison" ? styles.active : ""}
                    onClick={() =>
                      command({
                        type: "occupation",
                        province: p.id,
                        policy: "garrison",
                      })
                    }
                  >
                    Garnizon
                  </button>
                </div>
                <p>
                  Garnizon günlük 8 insan gücü ve 0,1 tüfekle direnişi bastırır.
                  Sivil yönetim uyumu daha hızlı artırır.
                </p>
              </>
            )}
          </div>
        )}
        <h3>Bölgedeki birlikler</h3>
        {own.filter((a) => a.province === p.id).length > 1 && (
          <button
            onClick={() =>
              onArmies(own.filter((a) => a.province === p.id).map((a) => a.id))
            }
          >
            Bölgedeki tüm tümenleri seç
          </button>
        )}
        {own
          .filter((a) => a.province === p.id)
          .map((a) => (
            <button
              className={styles.rowButton}
              key={a.id}
              onClick={() => onArmy(a.id)}
            >
              <span>
                {UNITS[a.type].symbol} {a.name}
              </span>
              <span>%{Math.round(a.organization)} ORG →</span>
            </button>
          ))}
        {!own.some((a) => a.province === p.id) && (
          <p className={styles.muted}>Bu bölgede kendi birliğin bulunmuyor.</p>
        )}
        <h3>Komşu bölgeler</h3>
        <div className={styles.chips}>
          {geo.neighbors.map((n) => (
            <button key={n.id} onClick={() => onProvince(n.id)}>
              {GEOGRAPHY[n.id].name}
              {n.sea ? " ⚓" : ""}
            </button>
          ))}
        </div>
        {p.controller === c.id && (
          <>
            <h3>Hızlı inşaat</h3>
            <label className={styles.field}>
              Yapı
              <select
                value={building}
                onChange={(e) => setBuilding(e.target.value as Building)}
              >
                {Object.entries(BUILDINGS).map(([key, d]) => (
                  <option key={key} value={key}>
                    {d.name} · {d.cost} hazine
                  </option>
                ))}
              </select>
            </label>
            <p>{BUILDINGS[building].description}</p>
            <button
              className={styles.primary}
              onClick={() =>
                command({ type: "build", province: p.id, building })
              }
            >
              İnşaat kuyruğuna ekle
            </button>
          </>
        )}
      </>
    );
  if (tab === "army")
    return (
      <>
        <div className={styles.eyebrow}>GENELKURMAY</div>
        <h2>Kara kuvvetleri</h2>
        <p className={styles.subtitle}>
          {own.length} tümen · {number(c.manpower)} yedek insan gücü
        </p>
        {w.battles
          .filter((b) => b.attacker === c.id || b.defender === c.id)
          .map((b) => (
            <div className={styles.card} key={b.id} data-testid="battle-report">
              <h3>⚔ {GEOGRAPHY[b.province].name} muharebesi</h3>
              <p>
                {w.countries[b.attacker].name} saldırıyor ·{" "}
                {w.countries[b.defender].name} savunuyor
              </p>
              <Meter
                value={(100 * b.attack) / Math.max(1, b.attack + b.defense)}
                label="Saldıran tarafın güç payı"
              />
              <p>
                Çatışma sürüyor. Birlikler asker ve organizasyon kaybediyor;
                toparlanmak için çatışmadan çıkmaları gerekir.
              </p>
              <button onClick={() => onProvince(b.province)}>
                Çatışma bölgesini incele →
              </button>
            </div>
          ))}
        <p className={styles.hint}>
          Toplam kayıp: {number(c.casualties)} asker. Emirler, üstteki ▶ ile
          zaman ilerlerken uygulanır.
        </p>
        <div className={styles.card}>
          <h3 data-testid="army-selection-count">
            {selectedIds.length} tümen seçili
          </h3>
          <p>
            Haritadaki simge o konumdaki tüm tümenleri seçer. Shift ile başka
            bir grubu seçime ekle. Aşağıdaki kutularla tümen ekleyip çıkar;
            birlik adına tıklayarak tek tümen seç.
          </p>
          <div className={styles.buttonRow}>
            <button
              disabled={!own.length}
              onClick={() => onArmies(own.map((a) => a.id))}
            >
              Tüm tümenleri seç
            </button>
            <button disabled={!selectedIds.length} onClick={() => onArmies([])}>
              Seçimi temizle
            </button>
          </div>
          {colocated.length > 1 && (
            <button onClick={() => onArmies(colocated.map((a) => a.id))}>
              {GEOGRAPHY[colocated[0].province].name}: {colocated.length} tümeni
              seç
            </button>
          )}
          <div className={styles.buttonRow}>
            <button
              className={styles.primary}
              disabled={!selectedIds.length}
              onClick={onOrder}
            >
              Haritada hedef seç · {selectedIds.length} tümen
            </button>
            <button
              disabled={!selectedIds.length}
              onClick={() =>
                command({ type: "haltGroup", armies: selectedIds })
              }
            >
              Dur / savun · {selectedIds.length} tümen
            </button>
          </div>
          <p>
            Hareket ve savunma emirleri seçili tüm tümenlere uygulanır. Hedef
            seçerken Shift, mevcut rotalara yeni hedef ekler.
          </p>
        </div>
        {a ? (
          <div className={styles.card}>
            {selectedIds.length > 1 && (
              <small>
                Birlik ayrıntısı · komutan ve destek değişiklikleri bu tümene
                uygulanır
              </small>
            )}
            <h3>
              {UNITS[a.type].symbol} {a.name}
            </h3>
            <p>
              {GEOGRAPHY[a.province].name} ·{" "}
              {number((UNITS[a.type].men * a.strength) / 100)} asker
              {a.move ? ` → ${GEOGRAPHY[a.move.to].name}` : ""}
            </p>
            <Meter value={a.strength} label="Mevcut" />
            <Meter value={a.organization} label="Organizasyon" />
            <Meter
              value={a.supply * 100}
              label="İkmal"
              color={a.supply < 0.4 ? "#c78369" : undefined}
            />
            <p>
              Moral %{Math.round(a.morale)} · Tecrübe {Math.floor(a.experience)}{" "}
              ·{" "}
              {a.experience >= 70
                ? "Elit"
                : a.experience >= 35
                  ? "Veteran"
                  : a.experience >= 10
                    ? "Düzenli"
                    : "Acemi"}{" "}
              · Siper %{Math.round(a.entrenchment)}
            </p>
            <label className={styles.field}>
              Komutan
              <select
                value={a.general ?? ""}
                onChange={(e) =>
                  command({
                    type: "general",
                    army: a.id,
                    general: e.target.value || null,
                  })
                }
              >
                <option value="">Komutan atanmadı</option>
                {c.generals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · Seviye {g.skill} ·{" "}
                    {g.trait === "defense"
                      ? "Savunma"
                      : g.trait === "attack"
                        ? "Taarruz"
                        : "Lojistik"}
                  </option>
                ))}
              </select>
            </label>
            {a.type === "paratrooper" && (
              <>
                <button
                  disabled={selectedIds.length !== 1}
                  onClick={onParadrop}
                >
                  Hava indirme hedefi seç
                </button>
                {selectedIds.length > 1 && (
                  <p>Hava indirme için tek bir paraşütçü tümeni seç.</p>
                )}
              </>
            )}
            <p>Emir okları haritada görünür; düşman toprağında savaş başlar.</p>
            <p data-testid="army-order-status">
              <strong>{armyStatus(w, a).label}</strong> ·{" "}
              {armyStatus(w, a).detail}
            </p>
            {armyMovementWarnings(w, a).map((warning) => (
              <p className={styles.hint} key={warning}>
                {warning}
              </p>
            ))}
            {a.move && (
              <>
                <small>Yol ilerlemesi</small>
                <Progress value={a.move.progress} total={a.move.days} />
              </>
            )}
          </div>
        ) : (
          <p className={styles.hint}>
            Haritadaki askerî sembole veya aşağıdaki birliğe tıkla; ardından
            hedef seçerek ilerleme emri ver.
          </p>
        )}
        <label className={styles.field}>
          Birlik ara
          <input
            value={armySearch}
            placeholder="Birlik adı, şehir veya tür"
            onChange={(e) => {
              setArmySearch(e.target.value);
              setArmyPage(0);
            }}
          />
        </label>
        <p className={styles.hint}>
          {selectedIds.length} seçili · {roster.length} birlik
          {armySearch.trim() ? " bulundu" : " listeleniyor"}. Seçimin diğer
          sayfalarda da korunur.
        </p>
        <div className={styles.list} data-testid="army-roster">
          {roster.slice(page * pageSize, (page + 1) * pageSize).map((a) => (
            <div
              key={a.id}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <input
                type="checkbox"
                aria-label={`${a.name} seçime dahil`}
                checked={selection.has(a.id)}
                onChange={(e) =>
                  onArmies(
                    e.target.checked
                      ? [...armyIds, a.id]
                      : armyIds.filter((id) => id !== a.id),
                  )
                }
                style={{
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  accentColor: "#b7bf8c",
                }}
              />
              <button
                className={`${styles.rowButton} ${selection.has(a.id) ? styles.active : ""}`}
                aria-pressed={selection.has(a.id)}
                onClick={() => onArmy(a.id)}
              >
                <span>
                  {UNITS[a.type].symbol} {a.name}
                  <small>{GEOGRAPHY[a.province].name}</small>
                </span>
                <span>
                  %{Math.round(a.strength)}
                  <small>{armyStatus(w, a).label}</small>
                </span>
              </button>
            </div>
          ))}
        </div>
        {pageCount > 1 && (
          <div
            className={styles.buttonRow}
            aria-label="Birlik listesi sayfaları"
          >
            <button disabled={page === 0} onClick={() => setArmyPage(page - 1)}>
              Önceki birlikler
            </button>
            <span>
              {page + 1} / {pageCount}
            </span>
            <button
              disabled={page + 1 === pageCount}
              onClick={() => setArmyPage(page + 1)}
            >
              Sonraki birlikler
            </button>
          </div>
        )}
        <ArmyTools
          w={w}
          command={command}
          armyId={armyId}
          onOffensive={onOffensive}
        />
        <h3>Savunma hatları</h3>
        <p>
          Haritada komşu eyaletlere sırayla tıklayarak savunma hattını çiz. Tüm
          tümenler bu hat boyunca dağılır; tek birliğe yeni emir vermen o
          birliği hattan ayırır.
        </p>
        <button disabled={!own.length} onClick={onFront}>
          Tüm tümenler için savunma hattı çiz
        </button>
        {w.fronts
          .filter((f) => f.country === c.id)
          .map((f) => (
            <div className={styles.card} key={f.id}>
              <h4>{f.provinces.map((id) => GEOGRAPHY[id].name).join(" → ")}</h4>
              <p>{f.armies.length} tümen atanmış</p>
              <button
                onClick={() => command({ type: "deleteFront", id: f.id })}
              >
                Hattı kaldır
              </button>
            </div>
          ))}
        <h3>Yeni tümen eğit</h3>
        <label className={styles.field}>
          Birlik tipi
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as UnitType)}
          >
            {Object.entries(UNITS).map(([id, d]) => (
              <option key={id} value={id}>
                {d.name}
                {d.tech && !c.tech.includes(d.tech)
                  ? " · araştırma gerekli"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <p>
          {number(UNITS[unit].men)} asker · {UNITS[unit].days} gün
          <br />
          {Object.entries(UNITS[unit].equipment)
            .map(([id, n]) => `${n} ${EQUIPMENT[id as Equipment].name}`)
            .join(", ")}
        </p>
        <button
          className={styles.primary}
          onClick={() =>
            command({
              type: "recruit",
              unit,
              province:
                p.controller === c.id && p.owner === c.id ? p.id : c.capital,
            })
          }
        >
          Eğitime başla ·{" "}
          {p.controller === c.id && p.owner === c.id
            ? geo.name
            : GEOGRAPHY[c.capital].name}
        </button>
        {c.recruitment.map((q) => (
          <div className={styles.card} key={q.id}>
            <h4>
              {UNITS[q.type].name} · {GEOGRAPHY[q.province].name}
            </h4>
            <Progress value={q.progress} total={q.total} />
          </div>
        ))}
      </>
    );
  if (tab === "economy")
    return (
      <>
        <div className={styles.eyebrow}>SANAYİ VE TEDARİK</div>
        <h2>Ekonomi</h2>
        <div className={styles.statsGrid}>
          <Stat
            label="Sivil kapasite"
            value={capacity(w, c.id, "civil").toFixed(1)}
          />
          <Stat
            label="Askerî / tersane"
            value={`${Math.floor(capacity(w, c.id, "military"))} / ${Math.floor(capacity(w, c.id, "dock"))}`}
          />
        </div>
        <label className={styles.field}>
          Ekonomi kanunu · değişiklik 50 siyasi güç
          <select
            value={c.economy}
            onChange={(e) =>
              command({
                type: "economy",
                law: e.target.value as Country["economy"],
              })
            }
          >
            {Object.entries(ECONOMIES).map(([id, d]) => (
              <option key={id} value={id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          Savaş ekonomisi üretimi artırır; sivil inşaatı ve vergi gelirini
          azaltır.
        </p>
        <Chart
          label="Haftalık hazine"
          values={c.history.map((h) => h.treasury)}
        />
        <Chart
          label="Haftalık fabrika kapasitesi"
          values={c.history.map((h) => h.factories)}
        />
        <h3>Stratejik stoklar</h3>
        <div className={styles.resourceGrid}>
          {Object.entries(RESOURCES).map(([id, name]) => (
            <Stat
              key={id}
              label={name}
              value={number(c.stock[id as Resource])}
            />
          ))}
        </div>
        <h3>Üretim hatları</h3>
        <p>
          ± ile fabrika ayır. Kaynak yoksa üretim yavaşlar. Aynı hat çalıştıkça
          verimlilik artar.
        </p>
        {Object.entries(EQUIPMENT).map(([id, d]) => {
          const line = c.production.find((p) => p.equipment === id),
            locked = d.tech && !c.tech.includes(d.tech);
          return (
            <div className={styles.production} key={id}>
              <div>
                <strong>{d.name}</strong>
                <small>
                  Depo: {number(c.equipment[id as Equipment])} ·{" "}
                  {locked
                    ? "Araştırma gerekli"
                    : line
                      ? `Verim %${Math.round(line.efficiency * 100)}`
                      : d.naval
                        ? "Tersane"
                        : "Askerî fabrika"}
                </small>
              </div>
              <div className={styles.stepper}>
                <button
                  aria-label={`${d.name} fabrika azalt`}
                  disabled={!line}
                  onClick={() =>
                    command({
                      type: "production",
                      equipment: id as Equipment,
                      factories: (line?.factories ?? 0) - 1,
                    })
                  }
                >
                  −
                </button>
                <b>{line?.factories ?? 0}</b>
                <button
                  aria-label={`${d.name} fabrika artır`}
                  disabled={!!locked}
                  onClick={() =>
                    command({
                      type: "production",
                      equipment: id as Equipment,
                      factories: (line?.factories ?? 0) + 1,
                    })
                  }
                >
                  ＋
                </button>
              </div>
            </div>
          );
        })}
        <h3>İnşaat kuyruğu</h3>
        <p>
          İnşaatlar sırayla tamamlanır. Eyalet panelinden yeni yapı
          ekleyebilirsin.
        </p>
        {c.construction.length === 0 && (
          <p className={styles.muted}>Kuyruk boş.</p>
        )}
        {c.construction.map((q, i) => (
          <div key={q.id} className={styles.card}>
            <h4>
              {i + 1}. {BUILDINGS[q.building].name}
            </h4>
            <p>
              {GEOGRAPHY[q.province].name}
              {w.provinces[q.province].controller !== c.id
                ? " · işgal nedeniyle durdu"
                : ""}
            </p>
            <Progress value={q.progress} total={q.total} />
            <button
              className={styles.textButton}
              onClick={() => command({ type: "cancelBuild", id: q.id })}
            >
              İptal et · kullanılmayan bütçenin %75’i iade
            </button>
          </div>
        ))}
      </>
    );
  if (tab === "diplomacy")
    return (
      <>
        <div className={styles.eyebrow}>DIŞİŞLERİ</div>
        <h2>Diplomasi</h2>
        <PeacePanel w={w} command={command} target={target} />
        {targetSelect}
        <div className={styles.countryHead}>
          <span style={{ background: t.color }}>{t.flag}</span>
          <div>
            <h3>{t.name}</h3>
            <p>
              {t.leader}
              <br />
              {IDEOLOGIES[t.ideology]}
            </p>
          </div>
        </div>
        <div className={styles.statsGrid}>
          <Stat label="İlişkiler" value={Math.round(c.relations[t.id] ?? 0)} />
          <Stat
            label="Diplomatik kabul"
            value={Math.round(diplomaticAcceptance(w, c.id, t.id))}
          />
          <Stat
            label="Kara gücü"
            value={
              hasIntel ? number(militaryPower(w, t.id)) : "İstihbarat gerekli"
            }
          />
          <Stat
            label="Durum"
            value={
              t.capitulated
                ? "Teslim oldu"
                : c.wars.includes(t.id)
                  ? "Savaşta"
                  : c.allies.includes(t.id)
                    ? "Müttefik"
                    : "Barışta"
            }
          />
        </div>
        <Meter
          label="Teslimiyet ilerlemesi"
          value={surrender(w, t.id)}
          color="#c78369"
        />
        {c.justification[t.id] && (
          <p className={styles.hint}>
            Savaş gerekçesi: {dateLabel(c.justification[t.id])} tarihinde hazır.
          </p>
        )}
        {(c.pacts[t.id] ?? 0) > w.day && (
          <p>Pakt bitişi: {dateLabel(c.pacts[t.id])}</p>
        )}
        <div className={styles.actionGrid}>
          {(
            [
              ["improve", "İlişkileri iyileştir", "15 siyasi güç · +18 ilişki"],
              ["justify", "Savaş gerekçesi", "40 siyasi güç · 45 gün"],
              ["war", "Savaş ilan et", "Hazır gerekçe ve sona ermiş pakt"],
              ["alliance", "İttifaka davet et", "25 siyasi güç · kabul ≥55"],
              ["pact", "Saldırmazlık paktı", "25 siyasi güç · kabul ≥35"],
              ["access", "Askerî geçiş iste", "25 siyasi güç · kabul ≥35"],
              ["peace", "Ateşkes teklif et", "Yorgunluk / askerî üstünlük"],
              [
                "embargo",
                c.embargoes.includes(t.id)
                  ? "Ambargoyu kaldır"
                  : "Ambargo uygula",
                "Kaynak ticaretini durdurur",
              ],
              ["aid", "Ekipman yardımı", "100 hazine + 30 tüfek"],
            ] as const
          ).map(([kind, label, hint]) => (
            <button
              key={kind}
              className={kind === "war" ? styles.danger : ""}
              onClick={() => command({ type: "diplomacy", target: t.id, kind })}
            >
              {label}
              <small>{hint}</small>
            </button>
          ))}
        </div>
        {((t.capitulated &&
          t.victor === c.id &&
          !w.conferences.some(
            (q) =>
              q.status === "open" &&
              q.defeated === t.id &&
              q.participants.length > 1,
          )) ||
          t.subjectOf === c.id) && (
          <div className={styles.card}>
            <h3>Barış koşulları</h3>
            <p>
              {t.subjectOf === c.id
                ? "Sana bağlı devlet."
                : "Zafer puanları ve başkent kaybı teslimiyete yol açtı."}
            </p>
            <div className={styles.buttonRow}>
              {t.capitulated && (
                <>
                  <button
                    onClick={() =>
                      command({
                        type: "diplomacy",
                        target: t.id,
                        kind: "annex",
                      })
                    }
                  >
                    İlhak et
                  </button>
                  <button
                    onClick={() =>
                      command({
                        type: "diplomacy",
                        target: t.id,
                        kind: "puppet",
                      })
                    }
                  >
                    Bağlı devlet
                  </button>
                </>
              )}
              <button
                onClick={() =>
                  command({ type: "diplomacy", target: t.id, kind: "liberate" })
                }
              >
                Bağımsızlık ver
              </button>
            </div>
          </div>
        )}
        <h3>Kaynak ticareti</h3>
        <label className={styles.field}>
          İthal edilecek kaynak
          <select
            value={tradeResource}
            onChange={(e) => setTradeResource(e.target.value as Resource)}
          >
            {Object.entries(RESOURCES).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            command({
              type: "trade",
              target: t.id,
              resource: tradeResource,
              amount: 3,
            })
          }
        >
          Günlük 3 birim ithal et · 6 hazine / gün
        </button>
        <p>
          Ödeme yalnızca teslim edilen kaynak için yapılır. Ambargo, stok ve
          konvoy baskınları teslimatı etkiler.
        </p>
        {w.trades
          .filter((t) => t.to === c.id || t.from === c.id)
          .map((t) => (
            <div key={t.id} className={styles.card}>
              <p>
                {w.countries[t.from].name} → {w.countries[t.to].name}
                <br />
                {RESOURCES[t.resource]} · {t.amount} / gün ·{" "}
                {tradeRoute(w, t.from, t.to)
                  ? `%${Math.round(tradeRoute(w, t.from, t.to)!.delivery * 100)} teslimat`
                  : "Güzergâh kapalı"}
              </p>
              <button
                onClick={() => command({ type: "cancelTrade", id: t.id })}
              >
                Anlaşmayı bitir
              </button>
            </div>
          ))}
      </>
    );
  if (tab === "research")
    return (
      <>
        <div className={styles.eyebrow}>BİLİM VE DOKTRİNLER</div>
        <h2>Araştırma</h2>
        <p className={styles.subtitle}>
          {c.research.length} / {researchSlots(c)} yuva · Hız bonusu %
          {Math.round((c.science + (c.advisor === "science" ? 0.15 : 0)) * 100)}
        </p>
        {c.research.map((q) => (
          <div key={q.id} className={styles.card}>
            <h3>{TECHNOLOGIES.find((t) => t.id === q.id)?.name}</h3>
            <Progress value={q.progress} total={q.total} />
            <p>
              Yaklaşık{" "}
              {Math.ceil(
                (q.total - q.progress) /
                  (1 + c.science + (c.advisor === "science" ? 0.15 : 0)),
              )}{" "}
              gün kaldı.
            </p>
          </div>
        ))}
        <label className={styles.field}>
          Araştırma dalı
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            {["Tümü", ...new Set(TECHNOLOGIES.map((t) => t.branch))].map(
              (b) => (
                <option key={b}>{b}</option>
              ),
            )}
          </select>
        </label>
        <p>
          Zamanından önce araştırma daha uzun sürer. Çizgiler, önce tamamlanması
          gereken teknolojileri gösterir.
        </p>
        <div className={styles.tree}>
          {TECHNOLOGIES.filter(
            (t) => branch === "Tümü" || t.branch === branch,
          ).map((t) => {
            const done = c.tech.includes(t.id),
              working = c.research.some((r) => r.id === t.id),
              locked = t.requires.some((id) => !c.tech.includes(id));
            return (
              <div
                className={`${styles.treeNode} ${done ? styles.completed : ""}`}
                key={t.id}
              >
                <small>
                  {t.branch} · {t.year}
                </small>
                <h3>
                  {done ? "✓ " : ""}
                  {t.name}
                </h3>
                <p>{t.description}</p>
                {t.requires.length > 0 && (
                  <small className={styles.prereq}>
                    ↳{" "}
                    {t.requires
                      .map((id) => TECHNOLOGIES.find((t) => t.id === id)?.name)
                      .join(" + ")}
                  </small>
                )}
                <button
                  disabled={
                    done ||
                    working ||
                    locked ||
                    c.research.length >= researchSlots(c)
                  }
                  onClick={() => command({ type: "research", id: t.id })}
                >
                  {done
                    ? "Tamamlandı"
                    : working
                      ? "Araştırılıyor"
                      : locked
                        ? "Önkoşul bekleniyor"
                        : `Araştır · ${researchDays(w, c, t.id)} temel gün`}
                </button>
              </div>
            );
          })}
        </div>
      </>
    );
  if (tab === "politics")
    return (
      <>
        <div className={styles.eyebrow}>HÜKÛMET VE ULUSAL HEDEFLER</div>
        <h2>{c.name}</h2>
        <CabinetPanel w={w} command={command} target={target} />
        <p className={styles.subtitle}>
          {c.leader} · {IDEOLOGIES[c.ideology]}
        </p>
        <Meter value={c.stability} label="İstikrar" />
        <Meter value={c.warSupport} label="Savaş desteği" />
        <Meter value={c.exhaustion} label="Savaş yorgunluğu" color="#c78369" />
        <label className={styles.field}>
          Askerlik kanunu · 60 siyasi güç
          <select
            value={c.conscription}
            onChange={(e) =>
              command({
                type: "conscription",
                law: e.target.value as Country["conscription"],
              })
            }
          >
            {Object.entries(CONSCRIPTION).map(([id, d]) => (
              <option key={id} value={id}>
                {d.name} · nüfusun %{d.fraction * 100}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Kabine danışmanı · değişiklik 40 siyasi güç
          <select
            value={c.advisor}
            onChange={(e) =>
              command({
                type: "advisor",
                advisor: e.target.value as Country["advisor"],
              })
            }
          >
            <option value="industry">Sanayi uzmanı · üretim ve inşaat</option>
            <option value="science">Araştırma kurumu · araştırma +%15</option>
            <option value="army">Askerî danışman · kara gücü +%10</option>
          </select>
        </label>
        <details className={styles.details}>
          <summary>Siyasi partiler ve reform</summary>
          <p>
            Her kampanya 60 siyasi güç karşılığında desteği 15 puan artırır;
            istikrarı 5 puan düşürür. %55 destek yönetimi değiştirir. Çok düşük
            istikrar iç savaşa dönüşebilir.
          </p>
          {Object.entries(IDEOLOGIES).map(([id, name]) => (
            <div key={id}>
              <Meter value={c.parties[id as Ideology]} label={name} />
              <button
                disabled={c.ideology === id}
                onClick={() =>
                  command({ type: "reform", ideology: id as Ideology })
                }
              >
                {c.ideology === id ? "İktidarda" : "Reform kampanyası"}
              </button>
            </div>
          ))}
        </details>
        <h3>Ulusal odak ağacı</h3>
        {c.focus && (
          <div className={styles.card}>
            <h4>{focusTree(c.id).find((f) => f.id === c.focus?.id)?.name}</h4>
            <Progress value={c.focus.progress} total={c.focus.total} />
            <p>{Math.ceil(c.focus.total - c.focus.progress)} gün kaldı.</p>
          </div>
        )}
        <div className={styles.tree}>
          {focusTree(c.id).map((f) => {
            const done = c.focuses.includes(f.id),
              locked =
                f.requires.some((id) => !c.focuses.includes(id)) ||
                !!(f.excludes && c.focuses.includes(f.excludes));
            return (
              <div
                key={f.id}
                className={`${styles.treeNode} ${done ? styles.completed : ""}`}
              >
                <small>{f.branch}</small>
                <h3>
                  {done ? "✓ " : ""}
                  {f.name}
                </h3>
                <p>{f.description}</p>
                {f.requires.length > 0 && (
                  <small className={styles.prereq}>
                    ↳{" "}
                    {f.requires
                      .map(
                        (id) => focusTree(c.id).find((f) => f.id === id)?.name,
                      )
                      .join(" + ")}
                  </small>
                )}
                <button
                  disabled={done || locked || !!c.focus}
                  onClick={() => command({ type: "focus", id: f.id })}
                >
                  {done
                    ? "Tamamlandı"
                    : locked
                      ? "Önceki yol gerekli"
                      : c.focus?.id === f.id
                        ? "Sürüyor"
                        : `Odağı seç · ${f.days} gün`}
                </button>
              </div>
            );
          })}
        </div>
      </>
    );
  if (tab === "operations")
    return (
      <>
        <div className={styles.eyebrow}>HAVA · DENİZ · İSTİHBARAT</div>
        <h2>Harekât merkezi</h2>
        {targetSelect}
        <AirNavalPanel w={w} command={command} target={target} />
        <details className={styles.fold}>
          <summary>Hızlı hava ve deniz emirleri</summary>
          <div className={styles.card}>
            <h3>Hava komutanlığı</h3>
            <p>
              {number(
                c.air.wings
                  .filter((a) => a.model === "fighter")
                  .reduce((n, a) => n + a.count, 0),
              )}{" "}
              avcı ·{" "}
              {number(
                c.air.wings
                  .filter((a) =>
                    ["bomber", "strategicBomber"].includes(a.model),
                  )
                  .reduce((n, a) => n + a.count, 0),
              )}{" "}
              bombardıman
              <br />
              Görev:{" "}
              {
                {
                  idle: "Beklemede",
                  superiority: "Hava üstünlüğü",
                  support: "Yakın hava desteği",
                  strategic: "Stratejik bombardıman",
                }[c.air.mission]
              }{" "}
              · {w.countries[c.air.target].name}
            </p>
            <div className={styles.buttonRow}>
              {(
                [
                  ["idle", "Bekle"],
                  ["superiority", "Üstünlük"],
                  ["support", "Yakın destek"],
                  ["strategic", "Bombardıman"],
                ] as const
              ).map(([mission, name]) => (
                <button
                  key={mission}
                  onClick={() =>
                    command({
                      type: "air",
                      target: mission === "idle" ? c.id : target,
                      mission,
                    })
                  }
                >
                  {name}
                </button>
              ))}
            </div>
            <p>
              Üstünlük, düşman hava gücünü yıpratır. Yakın destek kara
              saldırılarını güçlendirir. Bombardıman düşman başkentinin üretim
              ve ikmalini azaltır.
            </p>
            <button
              onClick={() =>
                command({ type: "air", target: c.id, mission: "superiority" })
              }
            >
              Kendi hava sahamı koru
            </button>
          </div>
          <div className={styles.card}>
            <h3>Deniz komutanlığı</h3>
            <p>
              {
                c.navy.ships.filter(
                  (s) => !["submarine", "carrier"].includes(s.model),
                ).length
              }{" "}
              savaş gemisi ·{" "}
              {c.navy.ships.filter((s) => s.model === "submarine").length}{" "}
              denizaltı ·{" "}
              {c.navy.ships.filter((s) => s.model === "carrier").length} uçak
              gemisi
              <br />
              Görev:{" "}
              {c.navy.mission === "idle"
                ? "Beklemede"
                : c.navy.mission === "raid"
                  ? "Konvoy baskını"
                  : "Devriye"}
            </p>
            <div className={styles.buttonRow}>
              {(
                [
                  ["idle", "Bekle"],
                  ["patrol", "Devriye"],
                  ["raid", "Konvoy baskını"],
                ] as const
              ).map(([mission, name]) => (
                <button
                  key={mission}
                  onClick={() =>
                    command({
                      type: "navy",
                      target: mission === "idle" ? c.id : target,
                      mission,
                    })
                  }
                >
                  {name}
                </button>
              ))}
            </div>
            <p>
              Donanma üstünlüğü deniz geçişlerini ve ada ikmalini açar.
              Denizaltı baskınları düşman kaynak ithalatını azaltır.
            </p>
          </div>
        </details>
        <div className={styles.card}>
          <h3>İstihbarat teşkilatı</h3>
          {!c.agency ? (
            <>
              <p>
                Teşkilat kur, ajan eğit ve hedef ülkeye operasyon düzenle.
                Sonuçlar istihbarat teknolojileri ve karşı casusluğa göre
                hesaplanır.
              </p>
              <button onClick={() => command({ type: "agency" })}>
                Teşkilat kur · 200 hazine
              </button>
            </>
          ) : (
            <>
              <p>
                {c.agents} boşta ajan · {c.missions.length} operasyonda
                {c.agentTraining ? ` · eğitim: ${c.agentTraining} gün` : ""}
              </p>
              <div className={styles.buttonRow}>
                <button
                  disabled={!!c.agentTraining}
                  onClick={() => command({ type: "trainAgent" })}
                >
                  Ajan eğit · 80 hazine
                </button>
                <button
                  className={c.counterIntel ? styles.active : ""}
                  onClick={() => command({ type: "counterIntel" })}
                >
                  {c.counterIntel
                    ? "Karşı casusluk: açık"
                    : "Karşı casusluğu aç"}
                </button>
              </div>
              <p>
                {t.name} · tahmini başarı %{Math.round(intelChance(c, t) * 100)}{" "}
                · görev başına 60 hazine.
              </p>
              {Object.entries(MISSIONS).map(([id, m]) => (
                <div className={styles.mission} key={id}>
                  <button
                    onClick={() =>
                      command({
                        type: "mission",
                        target: t.id,
                        mission: id as keyof typeof MISSIONS,
                      })
                    }
                  >
                    {m.name} · {m.days} gün
                  </button>
                  <p>{m.description}</p>
                </div>
              ))}
            </>
          )}
        </div>
        {c.missions.map((m) => (
          <div key={m.id} className={styles.card}>
            <h4>
              {MISSIONS[m.type].name} · {w.countries[m.target].name}
            </h4>
            <Progress value={m.progress} total={m.total} />
          </div>
        ))}
        {hasIntel && (
          <div className={styles.card}>
            <h3>{t.name}: istihbarat raporu</h3>
            <p>
              {w.armies.filter((a) => a.country === t.id).length} tümen ·{" "}
              {number(capacity(w, t.id, "military"))} askerî fabrika
              <br />
              Hava gücü {number(airPower(t))} · Deniz gücü{" "}
              {number(navalPower(t))}
              <br />
              {t.tech.length} teknoloji · {number(t.manpower)} yedek
            </p>
            {c.intel[t.id] && (
              <small>
                Rapor geçerliliği: {dateLabel(c.intel[t.id].expires)}
              </small>
            )}
          </div>
        )}
      </>
    );
  return null;
}
