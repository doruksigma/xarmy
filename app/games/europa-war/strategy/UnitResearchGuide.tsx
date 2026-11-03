import MilitaryIcon from "./MilitaryIcon";
import {
  getUnitVisualResearchGuide,
  type UnitVisualKind,
} from "./map3d-unit-research";
import { researchSlots } from "./politics";
import type { Country } from "./types";
import styles from "./unit-research-guide.module.css";
import {
  getCountryModelProfile,
  getNationalModelDescription,
} from "./map3d-national-profiles";

const ICONS = {
  infantry: "infantry",
  tank: "armor",
  artillery: "artillery",
  truck: "truck",
} as const satisfies Record<UnitVisualKind, string>;

function ResearchButton({
  country,
  id,
  locked,
  onResearch,
}: {
  country: Country;
  id: string;
  locked: boolean;
  onResearch: (id: string) => void;
}) {
  const pending = country.research.some((project) => project.id === id);
  const full = country.research.length >= researchSlots(country);
  const completed = country.tech.includes(id);
  return (
    <button
      type="button"
      className={styles.researchButton}
      data-visual-research-id={id}
      disabled={completed || pending || locked || full}
      onClick={() => onResearch(id)}
    >
      {completed
        ? "Tamamlandı"
        : pending
          ? "Araştırılıyor"
          : locked
            ? "Önkoşul gerekli"
            : full
              ? "Araştırma yuvası dolu"
              : "Araştırmayı başlat"}
    </button>
  );
}

/** Manual shortcuts to the same research commands used by the full tree. */
export default function UnitResearchGuide({
  country,
  onResearch,
}: {
  country: Country;
  onResearch?: (id: string) => void;
}) {
  const models = getUnitVisualResearchGuide(country);
  const national = getCountryModelProfile(country.id);
  return (
    <section
      className={styles.guide}
      aria-label="Birlik modelleri ve araştırma"
      data-unit-research-guide
      data-national-model-profile={national.id}
    >
      <h3>
        <MilitaryIcon name="infantry" size={19} /> Birliklerin görünümü
      </h3>
      <p className={styles.intro}>
        {national.label} modelleri. Üniforma ve araç biçimleri ülkenin
        görünümünü korur; tamamlanan araştırmalar donanımı geliştirir.
      </p>
      <ul className={styles.models}>
        {models.map((model) => (
          <li
            key={model.kind}
            className={styles.model}
            data-model-kind={model.kind}
            data-model-tier={model.tier}
          >
            <div className={styles.heading}>
              <MilitaryIcon name={ICONS[model.kind]} size={23} />
              <strong>{model.label}</strong>
              <span>Kademe {model.tier}/3</span>
            </div>
            <p className={styles.stage}>{model.stage}</p>
            <p className={styles.requirements}>
              {getNationalModelDescription(national, model.kind)}
            </p>
            <div className={styles.steps} aria-hidden="true">
              {[0, 1, 2, 3].map((tier) => (
                <span
                  key={tier}
                  className={tier <= model.tier ? styles.complete : undefined}
                />
              ))}
            </div>
            {model.next ? (
              <>
                <p className={styles.next}>
                  <b>Sonraki:</b> {model.next.name}
                </p>
                {model.next.requirements.length > 0 && (
                  <p className={styles.requirements}>
                    Önkoşul:{" "}
                    {model.next.requirements
                      .map(
                        (requirement) =>
                          `${requirement.name}${requirement.complete ? " (tamamlandı)" : " (gerekli)"}`,
                      )
                      .join(" · ")}
                  </p>
                )}
                {onResearch && (
                  <ResearchButton
                    country={country}
                    id={model.next.id}
                    locked={model.next.requirements.some(
                      (requirement) => !requirement.complete,
                    )}
                    onResearch={onResearch}
                  />
                )}
              </>
            ) : (
              <p className={styles.next}>
                En yüksek görünüm kademesi tamamlandı.
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Topçu görünümü ortak silah modernizasyonlarını izler. Savaş etkileri
        teknoloji açıklamalarında belirtilir.
      </p>
    </section>
  );
}
