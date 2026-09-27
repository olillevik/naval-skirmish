import type { CabinItem, CabinItemName, Config, TargetingRule, WorldState } from '../core/world';
import { text } from './text';

/** The row of one Cabin item, built once and filled from the state each time the Cabin shows. */
interface Row {
  item: CabinItemName;
  element: HTMLElement;
  level: HTMLElement;
  next: HTMLElement;
  price: HTMLElement;
  buy: HTMLButtonElement;
}

/**
 * The Cabin overlay: Gold, health and the vessel at the top, then the Targeting rule section with a button per
 * rule, the active one pressed, then the section for sale with a row per Cabin item. It is a page
 * element over the paused game, so it works with the mouse and with taps. Its rows come from the
 * world state's item list, so a new item only needs its text.
 */
export class Cabin {
  private element = document.getElementById('cabin')!;
  private gold = document.getElementById('cabin-gold')!;
  private health = document.getElementById('cabin-health')!;
  private vessel = document.getElementById('cabin-vessel')!;
  private items = document.getElementById('cabin-items')!;
  private rules = document.getElementById('cabin-rules')!;
  private rows = new Map<CabinItemName, Row>();

  constructor(
    private config: Config,
    onBuy: (item: CabinItemName) => void,
    onSetRule: (rule: TargetingRule) => void,
    onClose: () => void,
  ) {
    document.getElementById('cabin-title')!.textContent = text.cabinTitle;
    document.getElementById('cabin-rules-title')!.textContent = text.targetingRule;
    document.getElementById('cabin-shop-title')!.textContent = text.forSale;
    this.rules.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button');
      if (button?.dataset.rule) onSetRule(button.dataset.rule as TargetingRule);
    });
    const close = document.getElementById('cabin-close')!;
    close.textContent = text.cabinClose;
    close.addEventListener('click', onClose);
    this.items.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button');
      if (button?.dataset.item) onBuy(button.dataset.item as CabinItemName);
    });
  }

  get open(): boolean {
    return !this.element.hidden;
  }

  show(state: WorldState): void {
    const { gold, player, cabin, targetingRules, targetingRule } = state;
    this.gold.textContent = text.gold(gold);
    this.health.textContent = text.health(player.health, player.maxHealth);
    this.vessel.textContent = text.vesselClasses[player.vesselClass];
    this.rules.replaceChildren(
      ...targetingRules.map((rule) => {
        const button = Object.assign(document.createElement('button'), { type: 'button', textContent: text.targetingRules[rule] });
        button.dataset.rule = rule;
        button.dataset.testid = `rule-${rule}`;
        button.setAttribute('aria-pressed', String(rule === targetingRule));
        return button;
      }),
    );
    for (const item of cabin) this.fillRow(this.rows.get(item.item) ?? this.addRow(item.item), item);
    // An item the state leaves out, such as the vessel the player already sails, hides until a new Run lists it again.
    for (const row of this.rows.values()) row.element.hidden = !cabin.some(({ item }) => item === row.item);
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }

  private addRow(item: CabinItemName): Row {
    const { name } = text.cabinItems[item];
    const cell = (className: string, content = '') => Object.assign(document.createElement('span'), { className, textContent: content });
    const buy = Object.assign(document.createElement('button'), { type: 'button', textContent: text.buy });
    buy.dataset.item = item;
    buy.dataset.testid = `buy-${item}`;
    const li = document.createElement('li');
    const row: Row = { item, element: li, level: cell('level'), next: cell('next'), price: cell('price'), buy };
    li.dataset.testid = `cabin-item-${item}`;
    li.append(cell('name', name), row.level, row.next, row.price, buy);
    this.items.append(li);
    this.rows.set(item, row);
    return row;
  }

  private fillRow(row: Row, { level, highestLevel, nextPrice, canBuy, needsBiggerShip }: CabinItem): void {
    row.level.textContent = nextPrice === null ? text.maxed : highestLevel === null ? text.repeatable : text.level(level, highestLevel);
    row.next.textContent =
      nextPrice === null ? '' : needsBiggerShip ? text.needsBiggerShip : text.cabinItems[row.item].next(this.config, level);
    row.price.textContent = nextPrice === null ? '' : text.price(nextPrice);
    row.buy.disabled = !canBuy;
  }
}
