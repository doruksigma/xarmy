/** Europa War balance values, not historical measurements or HOI4 formulas. */
export const PRODUCTION_BALANCE = {
  workPerFactoryDay: 3,
  startingEfficiency: 0.2,
  dailyEfficiencyGain: 0.002,
  maximumEfficiency: 0.95,
  equipmentStockLimit: 100_000,
  roundingTolerance: 1e-9,
} as const;

export const ECONOMIES = {
  civilian: { name: "Sivil ekonomi", construction: 1, output: 1, tax: 1 },
  partial: {
    name: "Kısmi seferberlik",
    construction: 0.85,
    output: 1.25,
    tax: 0.9,
  },
  war: { name: "Savaş ekonomisi", construction: 0.7, output: 1.6, tax: 0.75 },
};
