/** Bounded art directions for the added 1936 countries. Families deliberately
 * reuse our procedural meshes; these are not claims of newly sourced assets. */
export type WorldUniformFamily =
  | "american"
  | "japanese"
  | "chinese"
  | "british"
  | "french"
  | "german"
  | "soviet"
  | "nordic"
  | "italian"
  | "dutch"
  | "desert";
const direction = (family: WorldUniformFamily, uniform: number) =>
  Object.freeze({ family, uniform });
export const WORLD_UNIT_DIRECTIONS = Object.freeze({
  usa: direction("american", 0x788061),
  canada: direction("british", 0x7a7457),
  newfoundland: direction("british", 0x7d795f),
  mexico: direction("american", 0x888268),
  cuba: direction("american", 0x8e8a64),
  haiti: direction("american", 0x9c9272),
  dominican: direction("american", 0x8f8c68),
  guatemala: direction("american", 0x777d61),
  honduras: direction("american", 0x8b886b),
  elsalvador: direction("american", 0x7e8260),
  nicaragua: direction("american", 0x8c8461),
  costarica: direction("american", 0x858367),
  panama: direction("american", 0x97906b),
  colombia: direction("german", 0x878563),
  venezuela: direction("french", 0x92906d),
  ecuador: direction("german", 0x878161),
  peru: direction("french", 0x938767),
  brazil: direction("french", 0x7b825f),
  bolivia: direction("german", 0x8d805d),
  paraguay: direction("french", 0x8f8568),
  chile: direction("german", 0x7d8176),
  argentina: direction("german", 0x838169),
  uruguay: direction("french", 0x81866e),
  japan: direction("japanese", 0x9a8c58),
  china: direction("chinese", 0x8e8968),
  manchukuo: direction("japanese", 0x968a61),
  mongolia: direction("soviet", 0x8b8569),
  tannutuva: direction("soviet", 0x8e8366),
  tibet: direction("chinese", 0x95896b),
  xinjiang: direction("soviet", 0x8d886f),
  siam: direction("japanese", 0x938c66),
  iran: direction("desert", 0xa09775),
  iraq: direction("desert", 0xa49770),
  afghanistan: direction("desert", 0x918971),
  nepal: direction("british", 0x8c845b),
  bhutan: direction("british", 0x96896a),
  saudi: direction("desert", 0xb1a17b),
  yemen: direction("desert", 0xa59676),
  oman: direction("desert", 0xafa283),
  kuwait: direction("desert", 0xb0a179),
  bahrain: direction("desert", 0xb3a583),
  qatar: direction("desert", 0xb4a884),
  trucial: direction("desert", 0xb8aa86),
  transjordan: direction("desert", 0xaaa07b),
  india: direction("british", 0x9b916c),
  malaya: direction("british", 0x8c8b66),
  brunei: direction("british", 0x97926f),
  indochina: direction("french", 0x9c9575),
  eastindies: direction("dutch", 0x76815c),
  philippines: direction("american", 0x948d67),
  ethiopia: direction("desert", 0xa29472),
  liberia: direction("american", 0x8d8a6a),
  egypt: direction("desert", 0xa69c78),
  southafrica: direction("british", 0x91875e),
  australia: direction("british", 0x8a845c),
  newzealand: direction("british", 0x847e59),
  tonga: direction("british", 0x928b64),
  iceland: direction("nordic", 0x828b82),
  andorra: direction("french", 0x847e6c),
  monaco: direction("french", 0x7e8274),
  sanmarino: direction("italian", 0x7d8574),
  vatican: direction("italian", 0x818575),
  liechtenstein: direction("german", 0x85887a),
});
