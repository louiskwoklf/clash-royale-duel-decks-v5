"use strict";

const CARD_CATALOG = Object.freeze([
  {
    "key": "goblins-hero",
    "name": "Hero Goblins",
    "rarity": "Common",
    "kind": "hero",
    "baseKey": "goblins"
  },
  {
    "key": "knight-hero",
    "name": "Hero Knight",
    "rarity": "Common",
    "kind": "hero",
    "baseKey": "knight"
  },
  {
    "key": "ice-golem-hero",
    "name": "Hero Ice Golem",
    "rarity": "Rare",
    "kind": "hero",
    "baseKey": "ice-golem"
  },
  {
    "key": "mega-minion-hero",
    "name": "Hero Mega Minion",
    "rarity": "Rare",
    "kind": "hero",
    "baseKey": "mega-minion"
  },
  {
    "key": "tombstone-hero",
    "name": "Hero Tombstone",
    "rarity": "Rare",
    "kind": "hero",
    "baseKey": "tombstone"
  },
  {
    "key": "musketeer-hero",
    "name": "Hero Musketeer",
    "rarity": "Rare",
    "kind": "hero",
    "baseKey": "musketeer"
  },
  {
    "key": "mini-pekka-hero",
    "name": "Hero Mini P.E.K.K.A",
    "rarity": "Rare",
    "kind": "hero",
    "baseKey": "mini-pekka"
  },
  {
    "key": "giant-hero",
    "name": "Hero Giant",
    "rarity": "Rare",
    "kind": "hero",
    "baseKey": "giant"
  },
  {
    "key": "wizard-hero",
    "name": "Hero Wizard",
    "rarity": "Rare",
    "kind": "hero",
    "baseKey": "wizard"
  },
  {
    "key": "barbarian-barrel-hero",
    "name": "Hero Barbarian Barrel",
    "rarity": "Epic",
    "kind": "hero",
    "baseKey": "barbarian-barrel"
  },
  {
    "key": "dark-prince-hero",
    "name": "Hero Dark Prince",
    "rarity": "Epic",
    "kind": "hero",
    "baseKey": "dark-prince"
  },
  {
    "key": "balloon-hero",
    "name": "Hero Balloon",
    "rarity": "Epic",
    "kind": "hero",
    "baseKey": "balloon"
  },
  {
    "key": "bowler-hero",
    "name": "Hero Bowler",
    "rarity": "Epic",
    "kind": "hero",
    "baseKey": "bowler"
  },
  {
    "key": "magic-archer-hero",
    "name": "Hero Magic Archer",
    "rarity": "Legendary",
    "kind": "hero",
    "baseKey": "magic-archer"
  },
  {
    "key": "skeletons-ev1",
    "name": "Skeletons Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "skeletons"
  },
  {
    "key": "ice-spirit-ev1",
    "name": "Ice Spirit Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "ice-spirit"
  },
  {
    "key": "bomber-ev1",
    "name": "Bomber Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "bomber"
  },
  {
    "key": "bats-ev1",
    "name": "Bats Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "bats"
  },
  {
    "key": "zap-ev1",
    "name": "Zap Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "zap"
  },
  {
    "key": "giant-snowball-ev1",
    "name": "Giant Snowball Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "giant-snowball"
  },
  {
    "key": "knight-ev1",
    "name": "Knight Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "knight"
  },
  {
    "key": "archers-ev1",
    "name": "Archers Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "archers"
  },
  {
    "key": "skeleton-barrel-ev1",
    "name": "Skeleton Barrel Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "skeleton-barrel"
  },
  {
    "key": "firecracker-ev1",
    "name": "Firecracker Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "firecracker"
  },
  {
    "key": "cannon-ev1",
    "name": "Cannon Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "cannon"
  },
  {
    "key": "mortar-ev1",
    "name": "Mortar Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "mortar"
  },
  {
    "key": "tesla-ev1",
    "name": "Tesla Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "tesla"
  },
  {
    "key": "barbarians-ev1",
    "name": "Barbarians Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "barbarians"
  },
  {
    "key": "minion-horde-ev1",
    "name": "Minion Horde Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "minion-horde"
  },
  {
    "key": "royal-giant-ev1",
    "name": "Royal Giant Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "royal-giant"
  },
  {
    "key": "royal-recruits-ev1",
    "name": "Royal Recruits Evolution",
    "rarity": "Common",
    "kind": "evolution",
    "baseKey": "royal-recruits"
  },
  {
    "key": "dart-goblin-ev1",
    "name": "Dart Goblin Evolution",
    "rarity": "Rare",
    "kind": "evolution",
    "baseKey": "dart-goblin"
  },
  {
    "key": "valkyrie-ev1",
    "name": "Valkyrie Evolution",
    "rarity": "Rare",
    "kind": "evolution",
    "baseKey": "valkyrie"
  },
  {
    "key": "musketeer-ev1",
    "name": "Musketeer Evolution",
    "rarity": "Rare",
    "kind": "evolution",
    "baseKey": "musketeer"
  },
  {
    "key": "battle-ram-ev1",
    "name": "Battle Ram Evolution",
    "rarity": "Rare",
    "kind": "evolution",
    "baseKey": "battle-ram"
  },
  {
    "key": "furnace-ev1",
    "name": "Furnace Evolution",
    "rarity": "Rare",
    "kind": "evolution",
    "baseKey": "furnace"
  },
  {
    "key": "goblin-cage-ev1",
    "name": "Goblin Cage Evolution",
    "rarity": "Rare",
    "kind": "evolution",
    "baseKey": "goblin-cage"
  },
  {
    "key": "wizard-ev1",
    "name": "Wizard Evolution",
    "rarity": "Rare",
    "kind": "evolution",
    "baseKey": "wizard"
  },
  {
    "key": "royal-hogs-ev1",
    "name": "Royal Hogs Evolution",
    "rarity": "Rare",
    "kind": "evolution",
    "baseKey": "royal-hogs"
  },
  {
    "key": "wall-breakers-ev1",
    "name": "Wall Breakers Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "wall-breakers"
  },
  {
    "key": "skeleton-army-ev1",
    "name": "Skeleton Army Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "skeleton-army"
  },
  {
    "key": "goblin-barrel-ev1",
    "name": "Goblin Barrel Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "goblin-barrel"
  },
  {
    "key": "baby-dragon-ev1",
    "name": "Baby Dragon Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "baby-dragon"
  },
  {
    "key": "hunter-ev1",
    "name": "Hunter Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "hunter"
  },
  {
    "key": "goblin-drill-ev1",
    "name": "Goblin Drill Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "goblin-drill"
  },
  {
    "key": "witch-ev1",
    "name": "Witch Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "witch"
  },
  {
    "key": "executioner-ev1",
    "name": "Executioner Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "executioner"
  },
  {
    "key": "electro-dragon-ev1",
    "name": "Electro Dragon Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "electro-dragon"
  },
  {
    "key": "goblin-giant-ev1",
    "name": "Goblin Giant Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "goblin-giant"
  },
  {
    "key": "pekka-ev1",
    "name": "P.E.K.K.A Evolution",
    "rarity": "Epic",
    "kind": "evolution",
    "baseKey": "pekka"
  },
  {
    "key": "princess-ev1",
    "name": "Princess Evolution",
    "rarity": "Legendary",
    "kind": "evolution",
    "baseKey": "princess"
  },
  {
    "key": "royal-ghost-ev1",
    "name": "Royal Ghost Evolution",
    "rarity": "Legendary",
    "kind": "evolution",
    "baseKey": "royal-ghost"
  },
  {
    "key": "lumberjack-ev1",
    "name": "Lumberjack Evolution",
    "rarity": "Legendary",
    "kind": "evolution",
    "baseKey": "lumberjack"
  },
  {
    "key": "inferno-dragon-ev1",
    "name": "Inferno Dragon Evolution",
    "rarity": "Legendary",
    "kind": "evolution",
    "baseKey": "inferno-dragon"
  },
  {
    "key": "mega-knight-ev1",
    "name": "Mega Knight Evolution",
    "rarity": "Legendary",
    "kind": "evolution",
    "baseKey": "mega-knight"
  },
  {
    "key": "skeletons",
    "name": "Skeletons",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "skeletons"
  },
  {
    "key": "ice-spirit",
    "name": "Ice Spirit",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "ice-spirit"
  },
  {
    "key": "fire-spirit",
    "name": "Fire Spirit",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "fire-spirit"
  },
  {
    "key": "electro-spirit",
    "name": "Electro Spirit",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "electro-spirit"
  },
  {
    "key": "goblins",
    "name": "Goblins",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "goblins"
  },
  {
    "key": "bomber",
    "name": "Bomber",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "bomber"
  },
  {
    "key": "spear-goblins",
    "name": "Spear Goblins",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "spear-goblins"
  },
  {
    "key": "bats",
    "name": "Bats",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "bats"
  },
  {
    "key": "berserker",
    "name": "Berserker",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "berserker"
  },
  {
    "key": "zap",
    "name": "Zap",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "zap"
  },
  {
    "key": "giant-snowball",
    "name": "Giant Snowball",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "giant-snowball"
  },
  {
    "key": "knight",
    "name": "Knight",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "knight"
  },
  {
    "key": "archers",
    "name": "Archers",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "archers"
  },
  {
    "key": "minions",
    "name": "Minions",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "minions"
  },
  {
    "key": "goblin-gang",
    "name": "Goblin Gang",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "goblin-gang"
  },
  {
    "key": "skeleton-barrel",
    "name": "Skeleton Barrel",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "skeleton-barrel"
  },
  {
    "key": "firecracker",
    "name": "Firecracker",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "firecracker"
  },
  {
    "key": "cannon",
    "name": "Cannon",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "cannon"
  },
  {
    "key": "arrows",
    "name": "Arrows",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "arrows"
  },
  {
    "key": "royal-delivery",
    "name": "Royal Delivery",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "royal-delivery"
  },
  {
    "key": "skeleton-dragons",
    "name": "Skeleton Dragons",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "skeleton-dragons"
  },
  {
    "key": "mortar",
    "name": "Mortar",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "mortar"
  },
  {
    "key": "tesla",
    "name": "Tesla",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "tesla"
  },
  {
    "key": "barbarians",
    "name": "Barbarians",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "barbarians"
  },
  {
    "key": "minion-horde",
    "name": "Minion Horde",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "minion-horde"
  },
  {
    "key": "rascals",
    "name": "Rascals",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "rascals"
  },
  {
    "key": "royal-giant",
    "name": "Royal Giant",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "royal-giant"
  },
  {
    "key": "elite-barbarians",
    "name": "Elite Barbarians",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "elite-barbarians"
  },
  {
    "key": "royal-recruits",
    "name": "Royal Recruits",
    "rarity": "Common",
    "kind": "normal",
    "baseKey": "royal-recruits"
  },
  {
    "key": "heal-spirit",
    "name": "Heal Spirit",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "heal-spirit"
  },
  {
    "key": "ice-golem",
    "name": "Ice Golem",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "ice-golem"
  },
  {
    "key": "suspicious-bush",
    "name": "Suspicious Bush",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "suspicious-bush"
  },
  {
    "key": "mega-minion",
    "name": "Mega Minion",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "mega-minion"
  },
  {
    "key": "dart-goblin",
    "name": "Dart Goblin",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "dart-goblin"
  },
  {
    "key": "elixir-golem",
    "name": "Elixir Golem",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "elixir-golem"
  },
  {
    "key": "tombstone",
    "name": "Tombstone",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "tombstone"
  },
  {
    "key": "earthquake",
    "name": "Earthquake",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "earthquake"
  },
  {
    "key": "valkyrie",
    "name": "Valkyrie",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "valkyrie"
  },
  {
    "key": "musketeer",
    "name": "Musketeer",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "musketeer"
  },
  {
    "key": "mini-pekka",
    "name": "Mini P.E.K.K.A",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "mini-pekka"
  },
  {
    "key": "hog-rider",
    "name": "Hog Rider",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "hog-rider"
  },
  {
    "key": "battle-ram",
    "name": "Battle Ram",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "battle-ram"
  },
  {
    "key": "zappies",
    "name": "Zappies",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "zappies"
  },
  {
    "key": "flying-machine",
    "name": "Flying Machine",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "flying-machine"
  },
  {
    "key": "battle-healer",
    "name": "Battle Healer",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "battle-healer"
  },
  {
    "key": "goblin-demolisher",
    "name": "Goblin Demolisher",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "goblin-demolisher"
  },
  {
    "key": "goblin-hut",
    "name": "Goblin Hut",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "goblin-hut"
  },
  {
    "key": "bomb-tower",
    "name": "Bomb Tower",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "bomb-tower"
  },
  {
    "key": "furnace",
    "name": "Furnace",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "furnace"
  },
  {
    "key": "goblin-cage",
    "name": "Goblin Cage",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "goblin-cage"
  },
  {
    "key": "fireball",
    "name": "Fireball",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "fireball"
  },
  {
    "key": "giant",
    "name": "Giant",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "giant"
  },
  {
    "key": "wizard",
    "name": "Wizard",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "wizard"
  },
  {
    "key": "royal-hogs",
    "name": "Royal Hogs",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "royal-hogs"
  },
  {
    "key": "inferno-tower",
    "name": "Inferno Tower",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "inferno-tower"
  },
  {
    "key": "barbarian-hut",
    "name": "Barbarian Hut",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "barbarian-hut"
  },
  {
    "key": "elixir-collector",
    "name": "Elixir Collector",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "elixir-collector"
  },
  {
    "key": "rocket",
    "name": "Rocket",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "rocket"
  },
  {
    "key": "three-musketeers",
    "name": "Three Musketeers",
    "rarity": "Rare",
    "kind": "normal",
    "baseKey": "three-musketeers"
  },
  {
    "key": "mirror",
    "name": "Mirror",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "mirror"
  },
  {
    "key": "wall-breakers",
    "name": "Wall Breakers",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "wall-breakers"
  },
  {
    "key": "rage",
    "name": "Rage",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "rage"
  },
  {
    "key": "barbarian-barrel",
    "name": "Barbarian Barrel",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "barbarian-barrel"
  },
  {
    "key": "goblin-curse",
    "name": "Goblin Curse",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "goblin-curse"
  },
  {
    "key": "skeleton-army",
    "name": "Skeleton Army",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "skeleton-army"
  },
  {
    "key": "guards",
    "name": "Guards",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "guards"
  },
  {
    "key": "goblin-barrel",
    "name": "Goblin Barrel",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "goblin-barrel"
  },
  {
    "key": "tornado",
    "name": "Tornado",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "tornado"
  },
  {
    "key": "clone",
    "name": "Clone",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "clone"
  },
  {
    "key": "void",
    "name": "Void",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "void"
  },
  {
    "key": "vines",
    "name": "Vines",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "vines"
  },
  {
    "key": "baby-dragon",
    "name": "Baby Dragon",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "baby-dragon"
  },
  {
    "key": "dark-prince",
    "name": "Dark Prince",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "dark-prince"
  },
  {
    "key": "hunter",
    "name": "Hunter",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "hunter"
  },
  {
    "key": "rune-giant",
    "name": "Rune Giant",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "rune-giant"
  },
  {
    "key": "goblin-drill",
    "name": "Goblin Drill",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "goblin-drill"
  },
  {
    "key": "freeze",
    "name": "Freeze",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "freeze"
  },
  {
    "key": "poison",
    "name": "Poison",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "poison"
  },
  {
    "key": "balloon",
    "name": "Balloon",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "balloon"
  },
  {
    "key": "witch",
    "name": "Witch",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "witch"
  },
  {
    "key": "prince",
    "name": "Prince",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "prince"
  },
  {
    "key": "bowler",
    "name": "Bowler",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "bowler"
  },
  {
    "key": "executioner",
    "name": "Executioner",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "executioner"
  },
  {
    "key": "cannon-cart",
    "name": "Cannon Cart",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "cannon-cart"
  },
  {
    "key": "electro-dragon",
    "name": "Electro Dragon",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "electro-dragon"
  },
  {
    "key": "giant-skeleton",
    "name": "Giant Skeleton",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "giant-skeleton"
  },
  {
    "key": "goblin-giant",
    "name": "Goblin Giant",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "goblin-giant"
  },
  {
    "key": "x-bow",
    "name": "X-Bow",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "x-bow"
  },
  {
    "key": "lightning",
    "name": "Lightning",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "lightning"
  },
  {
    "key": "pekka",
    "name": "P.E.K.K.A",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "pekka"
  },
  {
    "key": "electro-giant",
    "name": "Electro Giant",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "electro-giant"
  },
  {
    "key": "golem",
    "name": "Golem",
    "rarity": "Epic",
    "kind": "normal",
    "baseKey": "golem"
  },
  {
    "key": "the-log",
    "name": "The Log",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "the-log"
  },
  {
    "key": "ice-wizard",
    "name": "Ice Wizard",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "ice-wizard"
  },
  {
    "key": "princess",
    "name": "Princess",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "princess"
  },
  {
    "key": "miner",
    "name": "Miner",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "miner"
  },
  {
    "key": "bandit",
    "name": "Bandit",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "bandit"
  },
  {
    "key": "royal-ghost",
    "name": "Royal Ghost",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "royal-ghost"
  },
  {
    "key": "fisherman",
    "name": "Fisherman",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "fisherman"
  },
  {
    "key": "lumberjack",
    "name": "Lumberjack",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "lumberjack"
  },
  {
    "key": "inferno-dragon",
    "name": "Inferno Dragon",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "inferno-dragon"
  },
  {
    "key": "electro-wizard",
    "name": "Electro Wizard",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "electro-wizard"
  },
  {
    "key": "night-witch",
    "name": "Night Witch",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "night-witch"
  },
  {
    "key": "magic-archer",
    "name": "Magic Archer",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "magic-archer"
  },
  {
    "key": "mother-witch",
    "name": "Mother Witch",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "mother-witch"
  },
  {
    "key": "phoenix",
    "name": "Phoenix",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "phoenix"
  },
  {
    "key": "ram-rider",
    "name": "Ram Rider",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "ram-rider"
  },
  {
    "key": "goblin-machine",
    "name": "Goblin Machine",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "goblin-machine"
  },
  {
    "key": "graveyard",
    "name": "Graveyard",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "graveyard"
  },
  {
    "key": "sparky",
    "name": "Sparky",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "sparky"
  },
  {
    "key": "spirit-empress",
    "name": "Spirit Empress",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "spirit-empress"
  },
  {
    "key": "lava-hound",
    "name": "Lava Hound",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "lava-hound"
  },
  {
    "key": "mega-knight",
    "name": "Mega Knight",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "mega-knight"
  },
  {
    "key": "ronin",
    "name": "Ronin",
    "rarity": "Legendary",
    "kind": "normal",
    "baseKey": "ronin"
  },
  {
    "key": "little-prince",
    "name": "Little Prince",
    "rarity": "Champion",
    "kind": "normal",
    "baseKey": "little-prince"
  },
  {
    "key": "mighty-miner",
    "name": "Mighty Miner",
    "rarity": "Champion",
    "kind": "normal",
    "baseKey": "mighty-miner"
  },
  {
    "key": "skeleton-king",
    "name": "Skeleton King",
    "rarity": "Champion",
    "kind": "normal",
    "baseKey": "skeleton-king"
  },
  {
    "key": "golden-knight",
    "name": "Golden Knight",
    "rarity": "Champion",
    "kind": "normal",
    "baseKey": "golden-knight"
  },
  {
    "key": "archer-queen",
    "name": "Archer Queen",
    "rarity": "Champion",
    "kind": "normal",
    "baseKey": "archer-queen"
  },
  {
    "key": "monk",
    "name": "Monk",
    "rarity": "Champion",
    "kind": "normal",
    "baseKey": "monk"
  },
  {
    "key": "goblinstein",
    "name": "Goblinstein",
    "rarity": "Champion",
    "kind": "normal",
    "baseKey": "goblinstein"
  },
  {
    "key": "boss-bandit",
    "name": "Boss Bandit",
    "rarity": "Champion",
    "kind": "normal",
    "baseKey": "boss-bandit"
  }
].map((card) => Object.freeze(card)));
const CARD_KEYS = new Set(CARD_CATALOG.map((card) => card.key));

// Elixir cost per base card (RoyaleAPI data; hero/evolution variants share
// their base card's cost).
const ELIXIR_COSTS = Object.freeze({
  "archer-queen": 5,
  "archers": 3,
  "arrows": 3,
  "baby-dragon": 4,
  "balloon": 5,
  "bandit": 3,
  "barbarian-barrel": 2,
  "barbarian-hut": 6,
  "barbarians": 5,
  "bats": 2,
  "battle-healer": 4,
  "battle-ram": 4,
  "berserker": 2,
  "bomb-tower": 4,
  "bomber": 2,
  "boss-bandit": 6,
  "bowler": 5,
  "cannon": 3,
  "cannon-cart": 5,
  "clone": 3,
  "dark-prince": 4,
  "dart-goblin": 3,
  "earthquake": 3,
  "electro-dragon": 5,
  "electro-giant": 7,
  "electro-spirit": 1,
  "electro-wizard": 4,
  "elite-barbarians": 6,
  "elixir-collector": 6,
  "elixir-golem": 3,
  "executioner": 5,
  "fire-spirit": 1,
  "fireball": 4,
  "firecracker": 3,
  "fisherman": 3,
  "flying-machine": 4,
  "freeze": 4,
  "furnace": 4,
  "giant": 5,
  "giant-skeleton": 6,
  "giant-snowball": 2,
  "goblin-barrel": 3,
  "goblin-cage": 4,
  "goblin-curse": 2,
  "goblin-demolisher": 4,
  "goblin-drill": 4,
  "goblin-gang": 3,
  "goblin-giant": 6,
  "goblin-hut": 5,
  "goblin-machine": 5,
  "goblins": 2,
  "goblinstein": 5,
  "golden-knight": 4,
  "golem": 8,
  "graveyard": 5,
  "guards": 3,
  "heal-spirit": 1,
  "hog-rider": 4,
  "hunter": 4,
  "ice-golem": 2,
  "ice-spirit": 1,
  "ice-wizard": 3,
  "inferno-dragon": 4,
  "inferno-tower": 5,
  "knight": 3,
  "lava-hound": 7,
  "lightning": 6,
  "little-prince": 3,
  "lumberjack": 4,
  "magic-archer": 4,
  "mega-knight": 7,
  "mega-minion": 3,
  "mighty-miner": 4,
  "miner": 3,
  "mini-pekka": 4,
  "minion-horde": 5,
  "minions": 3,
  "mirror": 1,
  "monk": 5,
  "mortar": 4,
  "mother-witch": 4,
  "musketeer": 4,
  "night-witch": 4,
  "pekka": 7,
  "phoenix": 4,
  "poison": 4,
  "prince": 5,
  "princess": 3,
  "rage": 2,
  "ram-rider": 5,
  "rascals": 5,
  "rocket": 6,
  "ronin": 5,
  "royal-delivery": 3,
  "royal-ghost": 3,
  "royal-giant": 6,
  "royal-hogs": 5,
  "royal-recruits": 7,
  "rune-giant": 4,
  "skeleton-army": 3,
  "skeleton-barrel": 3,
  "skeleton-dragons": 4,
  "skeleton-king": 4,
  "skeletons": 1,
  "sparky": 6,
  "spear-goblins": 2,
  "spirit-empress": 6,
  "suspicious-bush": 2,
  "tesla": 4,
  "the-log": 2,
  "three-musketeers": 9,
  "tombstone": 3,
  "tornado": 3,
  "valkyrie": 4,
  "vines": 3,
  "void": 3,
  "wall-breakers": 2,
  "witch": 5,
  "wizard": 5,
  "x-bow": 6,
  "zap": 2,
  "zappies": 4,
});

function getCardCatalog() {
  return CARD_CATALOG.map((card) => ({
    ...card,
    elixir: ELIXIR_COSTS[card.baseKey ?? card.key] ?? null,
  }));
}

function hasCardKey(key) {
  return CARD_KEYS.has(key);
}

function validateCardKeys(keys, label = "cards") {
  if (!Array.isArray(keys)) {
    throw new Error(`${label} must be an array.`);
  }

  keys.forEach((key) => {
    if (!hasCardKey(key)) {
      throw new Error(`Unknown card key in ${label}: ${key}`);
    }
  });
}

module.exports = {
  getCardCatalog,
  hasCardKey,
  validateCardKeys,
};
