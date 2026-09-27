# Naval Skirmish

A top-down browser game. The player steers a vessel on a magical sea that ends in open space, and fights waves of enemy vessels.

## Language

### Vessels and crew

Vessel types are ordinary nouns: write dinghy and ship in lowercase except at the start of a sentence.

**Vessel**:
Anything the player or an enemy sails, from the smallest rowboat to the largest ship.
_Avoid_: Boat (when meaning any vessel), unit

**Dinghy**:
The rowboat the player starts in.
_Avoid_: Robot, rowboat, canoe

**Ship**:
A vessel with a hull and sails, bigger than a dinghy. The player can buy the small ship in the Cabin, and after it the medium ship with two masts. Both have white sails. A bigger ship has more health and speed and can carry more cannons.
_Avoid_: Using "ship" for a dinghy

**Wizard**:
A spellcaster aboard a vessel. Every player vessel has one. Enemy vessels rarely do.
_Avoid_: Mage, sorcerer

**Captain**:
The player's own Wizard. The Captain goes with the player from vessel to vessel.
_Avoid_: Player character, hero

**Crew**:
The ordinary sailors aboard a vessel. They shoot Arrows, and on a ship they fire the cannons too.
_Avoid_: Sailors, pirates

### Combat

**Fireball**:
A Wizard's spell, with a slow cooldown. The player decides when the Captain throws one. It hurts every enemy near the point where it hits and sets them Burning. A fleeing vessel can outrun one, but only just.
_Avoid_: Magic missile, shot

**Arrow**:
The Crew's weapon, carried by every vessel. Arrows always go for the closest enemy.
_Avoid_: Bolt, shot

**Volley**:
The Arrows a vessel's Crew shoots at the same moment. A Volley starts at 1 Arrow and can be upgraded to 5.
_Avoid_: Salvo, burst

**Flaming arrows**:
An upgrade that makes the Crew's Arrows set the target on fire.
_Avoid_: Fire arrows, burning arrows

**Wizard vessel**:
An enemy vessel with a Wizard aboard, marked by a glow and a flag of its own.
_Avoid_: Boss, elite

**Targeting rule**:
The Captain's choice of which enemy the Captain's Fireballs go for: closest, farthest, highest health or lowest health. All four are free, and the player picks one in the Cabin.
_Avoid_: Aim mode, priority

**Burning**:
Fire damage over a few seconds, set by a Fireball or a Flaming arrow. A new burn restarts the current one instead of stacking.
_Avoid_: DOT, damage over time

**Cannon**:
A gun on a ship. Dinghies have none. A ship's cannons fire together at the closest enemy in range, and reach farther than Arrows. A bought ship has 1 cannon, and the player buys more up to the most that ship can carry: 2 on the small ship and 4 on the medium ship.
_Avoid_: Gun, Broadside

**Cannonball**:
What a cannon fires.
_Avoid_: Shot, shell

### The world

**Arena**:
The patch of sea where a run is played.
_Avoid_: Map, level

**Edge**:
The boundary of the Arena, where the sea ends and a vessel falls into space.
_Avoid_: Wall, border

**Rim current**:
The pull toward the Edge in the outer part of the Arena. It gets stronger closer to the Edge, and near the Edge no vessel can row or sail against it.
_Avoid_: Gravity, drift

**Wave**:
One group of enemies. After a Wave is defeated there is a 5-second countdown, and then the next Wave starts. Waves never run out.
_Avoid_: Round, level

### Runs and progress

**Run**:
One game from the first Wave until the player's vessel sinks or falls off the Edge.
_Avoid_: Game, session, life

**Score**:
The number of Waves the player defeated in a Run.
_Avoid_: Points, high score

**Best score**:
The highest Score reached on this device.
_Avoid_: High score, record

**Gold**:
The currency the player earns by defeating enemies and spends on upgrades.
_Avoid_: Upgrade points, coins, money

**Upgrade**:
A Cabin item bought with Gold that improves the player's vessel, Crew or Captain for the rest of the Run. Most Upgrades have levels.
_Avoid_: Perk, power-up

**Repair**:
A Cabin item that restores part of the player vessel's health. It can be bought again and again.
_Avoid_: Heal, fix

**Cabin**:
The paused screen where the player sets the Targeting rule and spends Gold.
_Avoid_: Menu, shop, inventory
