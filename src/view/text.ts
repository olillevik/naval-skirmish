import type { CabinItemName, Config, VesselClassName } from '../core/world';

/** A Cabin item's name, and what its next level gives after the levels already bought. */
interface CabinItemText {
  name: string;
  next: (config: Config, level: number) => string;
}

const cabinItems: Record<CabinItemName, CabinItemText> = {
  repair: { name: 'Repair', next: (config) => `+${config.cabin.repair.healShare * 100}% of max health` },
};

/** The game's UI text, in English. Words follow CONTEXT.md. */
export const text = {
  cabinMark: 'E: Cabin',
  cabinButton: 'Cabin',
  cabinTitle: 'Cabin',
  cabinClose: 'Close',
  buy: 'Buy',
  maxed: 'maxed',
  repeatable: 'repeatable',
  gold: (gold: number) => `Gold ${gold}`,
  health: (health: number, maxHealth: number) => `Health ${Math.ceil(health)} / ${maxHealth}`,
  price: (gold: number) => `${gold} Gold`,
  level: (level: number, highestLevel: number) => `${level} / ${highestLevel}`,
  vesselClasses: {
    smallDinghy: 'small dinghy',
    enemyDinghy: 'enemy dinghy',
    enemyShip: 'enemy ship',
  } satisfies Record<VesselClassName, string>,
  cabinItems,
};
