import type { CabinItemName, Config, TargetingRule, VesselClassName } from '../core/world';

/** A Cabin item's name, what its next level gives after the levels already bought, and what it shows once maxed if not "maxed". */
interface CabinItemText {
  name: string;
  next: (config: Config, level: number) => string;
  maxed?: string;
}

const targetingRules: Record<TargetingRule, string> = {
  closest: 'closest',
  farthest: 'farthest',
  lowestHealth: 'lowest health',
  highestHealth: 'highest health',
};

const targetingRuleItem = (rule: TargetingRule): CabinItemText => ({
  name: `Targeting rule: ${targetingRules[rule]}`,
  next: () => 'unlocks the rule',
  maxed: 'owned',
});

const cabinItems: Record<CabinItemName, CabinItemText> = {
  repair: { name: 'Repair', next: (config) => `+${config.cabin.repair.healShare * 100}% of max health` },
  maxHealth: { name: 'Max health', next: (config) => `+${config.cabin.maxHealth.healthShare * 100}% of base max health` },
  regen: { name: 'Regen', next: (config) => `+${config.cabin.regen.regenRate * 100}% of max health per second` },
  arrowRate: { name: 'Arrow rate', next: (config, level) => `a Volley every ${config.cabin.arrowRate.volleySeconds[level]} s` },
  volleySize: { name: 'Volley size', next: (config) => `+${config.cabin.volleySize.arrows} Arrow per Volley` },
  flamingArrows: {
    name: 'Flaming arrows',
    next: (config) => `each hit burns for ${config.cabin.flamingArrows.burnSeconds} s at ${config.cabin.flamingArrows.damagePerSecond} damage per second`,
  },
  fireballDamage: { name: 'Fireball damage', next: (config, level) => `${config.cabin.fireballDamage.damage[level]} damage a Fireball` },
  fireballCooldown: {
    name: 'Fireball cooldown',
    next: (config, level) => `a Fireball every ${config.cabin.fireballCooldown.cooldownSeconds[level]} s`,
  },
  farthest: targetingRuleItem('farthest'),
  lowestHealth: targetingRuleItem('lowestHealth'),
  highestHealth: targetingRuleItem('highestHealth'),
  smallShip: {
    name: 'Small ship',
    next: (config) => {
      const { health, topSpeed } = config.vesselClasses.smallShip;
      return `${health} base max health, ${topSpeed} px/s, slower to turn`;
    },
  },
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
    smallShip: 'small ship',
    enemyDinghy: 'enemy dinghy',
    enemyShip: 'enemy ship',
  } satisfies Record<VesselClassName, string>,
  cabinItems,
  targetingRule: 'Targeting rule',
  targetingRules,
};
