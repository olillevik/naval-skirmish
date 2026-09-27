import type { CabinItemName, Config, VesselClassName } from '../core/world';

/** A Cabin item's name, and what its next level gives after the levels already bought. */
interface CabinItemText {
  name: string;
  next: (config: Config, level: number) => string;
}

const cabinItems: Record<CabinItemName, CabinItemText> = {
  repair: { name: 'Repair', next: (config) => `+${config.cabin.repair.healShare * 100}% of max health` },
  maxHealth: { name: 'Max health', next: (config) => `+${config.cabin.maxHealth.healthShare * 100}% of base max health` },
  regen: { name: 'Regen', next: (config) => `+${config.cabin.regen.regenRate * 100}% of max health per second` },
  arrowRate: { name: 'Arrow rate', next: (config, level) => `a Volley every ${config.cabin.arrowRate.volleySeconds[level]} s` },
  volleySize: { name: 'Volley size', next: (config) => `+${config.cabin.volleySize.arrows} Arrow per Volley` },
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
