"use client";

import { useState } from "react";
import MilitaryIcon, { equipmentIcon, unitIcon } from "./MilitaryIcon";
import { EQUIPMENT, UNITS } from "./catalog";
import { dateLabel, GEOGRAPHY } from "./world";
import { hourLabel } from "./time";
import type { Equipment, World } from "./types";
import type {
  ReinforcementCargo,
  ReinforcementShipment,
} from "./reinforcement-types";
import styles from "./reinforcement-logistics.module.css";

const formatter = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});
const amount = (value: number) =>
  value > 0 && value < 0.01 ? "<0,01" : formatter.format(value);
const PAGE_SIZE = 6;
const landEquipment = new Set(
  Object.values(UNITS).flatMap((unit) => Object.keys(unit.equipment)),
);
const BLOCKED: Record<NonNullable<ReinforcementShipment["blocked"]>, string> = {
  route: "Yol kapalı · bağlantı bekleniyor",
  combat: "Birlik çatışmada · teslimat bekliyor",
  supply: "Birliğin ikmali yetersiz · teslimat bekliyor",
  capacity: "Hat kapasitesi yetersiz · sevkiyat yavaşlıyor",
  depot: "Başkent deposunda erişim veya boş kapasite bekleniyor",
};

function Metric({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: number;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={`reinforcement-${id}`} data-value={value}>
        {amount(value)}
      </dd>
    </div>
  );
}

function Cargo({ cargo }: { cargo: ReinforcementCargo }) {
  return (
    <ul className={styles.cargo} aria-label="Ayrılmış sevkiyat yükü">
      <li>{amount(cargo.manpower)} personel</li>
      {(Object.entries(cargo.equipment) as [Equipment, number][])
        .filter(([, value]) => value > 0)
        .map(([equipment, value]) => (
          <li key={equipment}>
            {amount(value)} {EQUIPMENT[equipment].name}
          </li>
        ))}
    </ul>
  );
}

/** Shows only the player's paid reinforcement cargo and its own ledger. */
export default function ReinforcementLogistics({ world }: { world: World }) {
  const [page, setPage] = useState(0);
  const country = world.countries[world.player];
  const shipments = (world.reinforcements?.shipments ?? []).filter(
    (shipment) => shipment.country === country.id,
  );
  const ledger = world.reinforcements?.ledger[country.id];
  const inTransit: ReinforcementCargo = { manpower: 0, equipment: {} };
  for (const shipment of shipments) {
    inTransit.manpower += shipment.cargo.manpower;
    for (const [key, value] of Object.entries(shipment.cargo.equipment)) {
      const equipment = key as Equipment;
      inTransit.equipment[equipment] =
        (inTransit.equipment[equipment] ?? 0) + value;
    }
  }
  const equipment = (Object.keys(EQUIPMENT) as Equipment[]).filter(
    (id) =>
      landEquipment.has(id) ||
      (inTransit.equipment[id] ?? 0) > 0 ||
      (ledger?.dispatched.equipment[id] ?? 0) > 0,
  );
  const pages = Math.max(1, Math.ceil(shipments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const armies = new Map(world.armies.map((army) => [army.id, army]));
  return (
    <section
      className={styles.logistics}
      aria-label={`${country.name} takviye sevkiyatları`}
      data-testid="reinforcement-logistics"
      data-country={country.id}
    >
      <header className={styles.header}>
        <MilitaryIcon name="supply" size={20} />
        <div>
          <h3>Takviye sevkiyatları</h3>
          <p>
            Eksik birliklere her gün otomatik takviye ayrılır. Personel ve
            ekipman ancak ulaştığında birliği güçlendirir.
          </p>
        </div>
      </header>
      <dl className={styles.metrics}>
        <Metric
          id="free-manpower"
          label="Serbest yedek personel"
          value={country.manpower}
        />
        <Metric
          id="transit-manpower"
          label="Sevkiyattaki personel"
          value={inTransit.manpower}
        />
      </dl>
      {!shipments.length && (
        <p className={styles.notice} data-testid="reinforcement-empty">
          {ledger
            ? "Şu anda yolda takviye yok. Eksik birlik, serbest stok ve uygun ikmal bağlantısı olduğunda yeni sevkiyat hazırlanır."
            : "Henüz takviye sevkiyatı oluşmadı. Gün değişiminde, çatışma dışında ve ikmali yeterli olan eksik birlikler için başkentten yük ayrılır."}
        </p>
      )}
      <details className={styles.details}>
        <summary>
          Sevkiyat ve depo ayrıntıları
          <span data-testid="reinforcement-active-count">
            {shipments.length} aktif
          </span>
        </summary>
        <p className={styles.notice}>
          Ayrılan yük serbest stoktan düşülmüştür. Yol kapanırsa bekler; hedef
          birlik değişirse geri döner. Ele geçirilen yük kayıp sayılır.
          Dönüşteki yük de aşağıdaki sevkiyat toplamına dahildir.
        </p>
        {!!shipments.length && (
          <>
            <ol className={styles.shipments} aria-label="Aktif takviyeler">
              {shipments
                .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                .map((shipment) => {
                  const army = armies.get(shipment.army);
                  const current = GEOGRAPHY[shipment.province].name;
                  const destination = GEOGRAPHY[shipment.destination].name;
                  const returning = shipment.status === "returning";
                  const status = shipment.blocked
                    ? BLOCKED[shipment.blocked]
                    : shipment.loadingHours > 0
                      ? "Depoda yükleniyor"
                      : returning
                        ? "Depoya dönüyor"
                        : "Birliğe gidiyor";
                  return (
                    <li
                      key={shipment.id}
                      className={styles.shipment}
                      data-testid={`reinforcement-shipment-${shipment.id}`}
                      data-status={shipment.status}
                      data-blocked={shipment.blocked ?? ""}
                    >
                      <h4>
                        <MilitaryIcon
                          name={unitIcon(shipment.unit)}
                          size={16}
                        />
                        {army?.country === country.id
                          ? army.name
                          : `${UNITS[shipment.unit].name} · eski hedef`}
                      </h4>
                      <p
                        className={styles.status}
                        data-tone={shipment.blocked ? "warning" : undefined}
                      >
                        {status}
                      </p>
                      <p className={styles.route}>
                        {current} → {destination}
                        {returning && " · Başkent deposu"}
                      </p>
                      {shipment.leg && (
                        <p className={styles.notice}>
                          Sıradaki durak: {GEOGRAPHY[shipment.leg.to].name} ·
                          etap %
                          {Math.min(
                            100,
                            Math.floor(
                              (shipment.leg.progress / shipment.leg.hours) *
                                100,
                            ),
                          )}
                        </p>
                      )}
                      <Cargo cargo={shipment.cargo} />
                      <small>
                        Çıkış: {GEOGRAPHY[shipment.origin].name} ·{" "}
                        {dateLabel(Math.floor(shipment.createdHour / 24))}{" "}
                        {hourLabel(shipment.createdHour)}
                      </small>
                    </li>
                  );
                })}
            </ol>
            {pages > 1 && (
              <div
                className={styles.pagination}
                aria-label="Sevkiyat sayfaları"
              >
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Önceki sevkiyatlar
                </button>
                <span>
                  {currentPage + 1} / {pages}
                </span>
                <button
                  type="button"
                  disabled={currentPage + 1 === pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Sonraki sevkiyatlar
                </button>
              </div>
            )}
          </>
        )}
        <h4 className={styles.subheading}>Personel hesabı</h4>
        <dl className={`${styles.metrics} ${styles.totals}`}>
          <Metric
            id="dispatched-manpower"
            label="Toplam ayrılan"
            value={ledger?.dispatched.manpower ?? 0}
          />
          <Metric
            id="delivered-manpower"
            label="Birliklere teslim"
            value={ledger?.delivered.manpower ?? 0}
          />
          <Metric
            id="returned-manpower"
            label="Depoya dönen"
            value={ledger?.returned.manpower ?? 0}
          />
          <Metric
            id="lost-manpower"
            label="Yolda kaybedilen"
            value={ledger?.lost.manpower ?? 0}
          />
        </dl>
        <div
          className={styles.tableViewport}
          role="region"
          aria-label="Takviye ekipman hesabı; yatay kaydırılabilir"
          tabIndex={0}
        >
          <table className={styles.table}>
            <caption>Ekipman deposu ve takviye hesabı</caption>
            <thead>
              <tr>
                <th scope="col">Ekipman</th>
                <th scope="col">Serbest</th>
                <th scope="col">Sevkiyatta</th>
                <th scope="col">Teslim</th>
                <th scope="col">Dönen</th>
                <th scope="col">Kayıp</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((id) => (
                <tr key={id}>
                  <th scope="row">
                    <MilitaryIcon name={equipmentIcon(id)} size={14} />{" "}
                    {EQUIPMENT[id].name}
                  </th>
                  {[
                    ["free", country.equipment[id]],
                    ["transit", inTransit.equipment[id] ?? 0],
                    ["delivered", ledger?.delivered.equipment[id] ?? 0],
                    ["returned", ledger?.returned.equipment[id] ?? 0],
                    ["lost", ledger?.lost.equipment[id] ?? 0],
                  ].map(([kind, value]) => (
                    <td
                      key={kind}
                      data-testid={`reinforcement-${kind}-${id}`}
                      data-value={value}
                    >
                      {amount(value as number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.notice}>
          Teslim, dönüş ve kayıp sütunları bu takviye sisteminin birikmiş
          toplamlarıdır. Ondalıklar kademeli takviye miktarını gösterir.
          Yolculuk süresi mesafe, hasar ve hattı paylaşan yüke göre değişir.
        </p>
      </details>
    </section>
  );
}
