# Campaign Balance Audit — Maryland Campaign, Season 1

**Source data:** `campaign-Maryland-Campaign-Season-1-2026-09-18.json`
**Scope:** 5 turns, 8 battles, 137 territories, Eastern Theatre county map
**Result as played:** USA 475 SP / CSA 285 SP · VP 129–125

---

## 1. Executive summary

Season 1 was not decided by territory, by turns, or by how the sides played. It was
decided by **one battle the CSA won**.

The three headline numbers:

| Finding | Number |
|---|---|
| Difference in supply *income* between the two sides over the whole campaign | **0** (515 vs 515) |
| Share of the final 190 SP gap created by the single Washington DC assault | **108%** (205 of 190; everything else netted 15 the other way) |
| Territories that ever changed hands, out of 137 | **6 (4.4%)** |

The CSA captured the enemy capital on turn 4 and that victory cost them the season.
They paid 285 SP to take a region generating 7 SP/turn — a **41-turn payback on a
30-turn campaign**. The USA paid 80 SP to lose it.

That is the whole audit in one line: **the system charges a premium for winning.**

---

## 2. What the data actually shows

### 2.1 The supply ledger

| | USA | CSA |
|---|---|---|
| Starting SP | 750 | 750 |
| Generated (T2–T5) | **515** | **515** |
| Spent | 790 | 980 |
| **Final** | **475** | **285** |

Income was *identical*. Not close — identical. The entire strategic map, all 137
counties, all the capture-and-hold play, produced **zero** income differential across
five turns.

Why: starting VP is near-symmetric by design (129 vs 136), only 6 regions flipped,
and `captureTransitionTurns: 2` delays the VP from a capture by two turns — so by the
time a capture starts paying, the next turn has usually reversed it.

The map is currently decorative.

### 2.2 Battle-by-battle cost

| Turn | Region | pv | Attacker | Cost | Defender | Cost | Winner |
|---|---|---|---|---|---|---|---|
| 1 | Loudoun County | 3 | CSA | 65 | USA | 85 | CSA |
| 1 | Northern Virginia | 4 | USA | 112 | CSA | 88 | CSA |
| 2 | Washington Co. (Antietam) | 5 | USA | 133 | CSA | 117 | USA |
| 2 | Harper's Ferry | 5 | CSA | 126 | USA | 124 | USA |
| 3 | Harper's Ferry | 5 | CSA | 88¹ | USA | 67 | USA |
| 3 | Northern Virginia | 4 | USA | 101 | CSA | 99 | USA |
| 4 | **Washington DC** | **7** | **CSA** | **285** | **USA** | **80** | **CSA** |
| 4 | Frederick County | 4 | CSA | 112 | USA | 88 | CSA |

¹ Valley Supply Lines active (−50%); raw cost was 175.

Note that **6 of 8 battles were fought over NEUTRAL ground**, where attack and defense
base costs are both 50 — i.e. symmetric. Only two battles (T3 Harper's Ferry, T4 DC)
ever used the asymmetric enemy-territory rates. The 3:1 attack penalty that broke the
CSA was only applied twice, and once was enough.

### 2.3 Skill barely registers

Attacker's share of total casualties, all 8 battles:

```
0.436  0.559  0.534  0.506  0.465  0.507  0.543  0.558
mean 0.513 · stdev 0.041 · range 0.436–0.559
```

Casualty ratio is the *only* term in the cost formula that reflects how the teams
actually played. Across eight WoR line battles it moved within **±9% of 50%**.

Meanwhile `pointValue` ranges 1–7 and multiplies cost **linearly**, a 700% swing.

> **Which county the admin puts on the schedule matters ~78× more than how either
> side plays the match.**

This is not a tuning miss, it's a structural one. Evenly-matched WoR line battles
produce near-even casualties; the formula was built around a variable that doesn't vary.

### 2.4 Winning and losing a defense cost the same

`calculateDefenderCPLoss()` accepts a `defenderWon` parameter and ignores it —
the JSDoc says so explicitly: *"no longer affects calculation"*. The original
`CP_SYSTEM_SPECIFICATION.md` had failed defense pay max cost; that was removed.

Consequence: a side that folds three defenses pays the same as one that holds three,
for the same casualties. There is no supply consequence for losing — only the territory.

### 2.5 No victory condition was reachable

The three implemented conditions:

| Condition | Reachable in a season? |
|---|---|
| Supply depletion (≤0) | CSA was ~2.5 turns away — the only live one |
| Total territorial control | Requires **all 137** territories. Never. |
| Date victory (Dec 1865) | **Turn 30.** You played 5. |

The campaign ended by admin judgment, and the published scoreline (129–125) does not
reflect what happened — the actual margin was a 40% supply deficit. A season needs a
condition that resolves in 5–10 turns.

### 2.6 Abilities were lottery tickets, not decisions

Both abilities were used exactly once. **Both were spent on battles their side lost.**

- **Special Orders 191** (USA, T1 Northern Virginia) — effect is *"3× defender SP loss
  on attacker victory."* The USA lost that attack, so the multiplier never fired. Its
  only effect was keeping the region neutral.
- **Valley Supply Lines** (CSA, T3 Harper's Ferry) — −50% attacker cost. Saved 87 SP
  on a failed assault. It made a defeat cheaper.

Three problems compound:
1. Both abilities are **attack-only**. There is nothing to choose for defense.
2. Special Orders 191 is **win-conditional**, so it's a coin-flip, not a decision.
3. `abilityCooldown: 4` in a 5-turn season means **one use per campaign**.

### 2.7 Map scale vs. battle throughput

- 137 territories · 8 battles in 5 turns = **1.6 battles/turn**
- 131 territories (95.6%) never touched
- 109 of 137 are 1–2 VP filler
- Only ~29 sit on any frontline
- At this rate, touching every region once would take **85 turns**

The map promises a theatre and delivers a four-tile corridor: Harper's Ferry,
Northern Virginia, Frederick, DC.

### 2.8 Minor: data inconsistency worth a look

`va-fairfax` records `captureHistory: {turn 1, owner: "CSA"}`, but the turn-3 SP costs
(101/99) can only be produced by a **NEUTRAL** base rate of 50 — so the region was
neutral going into turn 3, not CSA-owned. Likely the Special Orders 191 neutral-override
in `campaignLogic.js:102` ran against `territory.owner` but `captureHistory` recorded
the raw `battle.winner`. Low impact (it made the USA's retake cheaper than it should
have been) but worth confirming before Season 2.

---

## 3. Root causes

| # | Cause | Effect |
|---|---|---|
| **R1** | Attack base 75 vs defense base 25 on enemy soil, with **no reward for capturing** | Offense is never economically rational. Best play is to sit still. |
| **R2** | `pointValue` multiplies cost **linearly and uncapped** (1×–7×) | One capital assault = 38% of a starting pool. One battle ends a season. |
| **R3** | Casualty ratio is the only skill term, and it's near-constant | The WoR matches barely feed back into the campaign. |
| **R4** | 137 regions, ~29 contestable, 1.6 battles/turn, symmetric income | Territory generates no income differential. The map does nothing. |

---

## 4. Recommendations

Three parts, in order of effort: settings-only, then the doctrine draft, then code.

### Part 1 — Season 2 settings (no code required)

Every one of these is already exposed in the Settings modal.

| Setting | S1 | **S2** | Why |
|---|---|---|---|
| `startingCP` | 750 | **600** | Shorter runway; income becomes a larger share of spending power |
| `baseAttackCostEnemy` | 75 | **110** | ↑ with compressed multiplier (§Part 3) to hold burn rate |
| `baseAttackCostNeutral` | 50 | **80** | " |
| `baseDefenseCostFriendly` | 25 | **55** | **Key change.** Cuts the attack:defense ratio from 3:1 to 2:1 |
| `baseDefenseCostNeutral` | 50 | **80** | Keeps neutral fights symmetric |
| `abilityCooldown` | 4 | **2** | Two uses per season instead of one |
| `captureTransitionTurns` | 2 | **1** | Captures start paying inside the season |

**Modelled against the real Season 1 battles**, with the §Part 3 multiplier and rebate:

```
                       AS PLAYED        SEASON 2 SETTINGS
DC assault (CSA atk)      285                 160
DC defense (USA def)       80                 101
attack:defense ratio    3.6 : 1             1.6 : 1

Final SP        USA 475 / CSA 285    USA 363 / CSA 336
Gap                     190                  27
Net burn/turn    USA −29 / CSA −67    USA −21 / CSA −27
```

The campaign would still have been live at turn 5, with both sides at ~58% of
starting supply and genuine depletion pressure by turn 8–10. The CSA would have
been *behind*, not *broken* — which is the correct outcome for a side that traded
three failed assaults for a capital.

### Part 2 — The doctrine draft

This is the requested feature and it's the right instinct: it gives both sides a
**strategic identity chosen before turn 1**, and it fixes the "nothing to pick for
defense" gap.

**Structure — deliberately RS2-simple:**

- At campaign setup each side drafts **one Offensive Doctrine** and **one Defensive Doctrine**
- Picks are made **blind and revealed simultaneously** (good Discord moment)
- Doctrines are **locked for the season** — that's the commitment
- **Offensive doctrines are active:** 2 activations per season, declared when the attack is committed
- **Defensive doctrines are passive:** always on, no tracking, and therefore *impossible to waste*

That last split is the important one. It removes the Season 1 failure mode where an
ability gets burned on a loss, and it means the defending side never has to guess.

Every effect below is a **supply-economy modifier**. Nothing needs enforcing inside
War of Rights itself — it all resolves in the tracker.

---

#### 🇺🇸 USA — Offensive Doctrines *(pick 1, 2 activations)*

| Doctrine | Effect |
|---|---|
| **Special Orders 191** | Attacker cost −40%. If you also win, the defender pays +100%. *(Reworked: now pays out even on a loss, so it's a decision, not a coin flip.)* |
| **Anaconda Plan** | Attack any enemy region bordering water (Chesapeake, Potomac, Ohio) regardless of adjacency to your line. Cost −25%. *(Opens the dead Eastern Shore and river counties.)* |
| **Grand Army Advance** | Attack two adjacent regions in the same turn; the second costs −50%. *(Directly raises battle throughput — the #1 problem.)* |

#### 🇺🇸 USA — Defensive Doctrines *(passive)*

| Doctrine | Effect |
|---|---|
| **Fortify the Heights** | Successful defense refunds 50% of your cost **and** the attacker pays +25%. *(Rewards holding, not folding.)* |
| **Quartermaster Corps** | +20% supply generation from every Urban region you hold. *(Finally makes Baltimore, Wheeling and DC worth owning.)* |
| **Iron Brigade** | Once per season, the first lost defense of a 4+ VP region doesn't flip — the region goes NEUTRAL and contested instead. |

#### 🔴 CSA — Offensive Doctrines *(pick 1, 2 activations)*

| Doctrine | Effect |
|---|---|
| **Valley Supply Lines** | Attacker cost −50%. *(Unchanged — the safe pick.)* |
| **Foot Cavalry** | Attack a region **two steps** from your line, ignoring adjacency. Normal cost. *(Jackson. Makes the map bigger instead of smaller.)* |
| **Stuart's Ride** | Raid a region up to 3 steps away. You cannot capture it, but on a win the enemy earns **no supply from it for 2 turns** and pays full defense cost. Your cost is halved. *(Gives the 131 dead counties a purpose.)* |

#### 🔴 CSA — Defensive Doctrines *(passive)*

| Doctrine | Effect |
|---|---|
| **Stone Wall** | Successful defense: the attacker pays +50%. *(Punishes probing.)* |
| **Interior Lines** | Defending a region adjacent to 2+ friendly regions costs −40%. *(Rewards a consolidated line and punishes overextension — exactly what beat the CSA in S1.)* |
| **Scorched Earth** | When you lose a region, the captor earns no supply and no VP from it for 2 turns. *(Half-built already via `captureTransitionTurns`.)* |

---

**Why 3 options per slot, not 6:** twelve doctrines total is already at the edge of
what stays memorable in a Discord briefing. Three per menu means every pick is a real
trade-off rather than a wiki lookup. Add more in later seasons once these are proven.

### Part 3 — Code changes, ranked

**C1 · Compress the point-value multiplier** *(highest impact, ~5 lines)*

`getVPMultiplier()` currently returns `pointValue / vpBase` — linear and uncapped, so
a 7-point capital costs 7× a 1-point county. Replace with a compressed curve:

```js
// cpSystem.js — getVPMultiplier()
return 1 + (pointValue - 1) * 0.5;   // 1pt=1×, 3pt=2×, 5pt=3×, 7pt=4×
```

Capitals stay the most expensive target on the board without being season-enders.
(Pair with the raised base costs in Part 1 to hold the overall burn rate.)

**C2 · Capture rebate** *(the fix for R1, ~3 lines)*

On a successful capture, refund **33%** of the attacker's supply cost — captured
depots, stores and rolling stock. Applied to the DC assault: 160 → 107, against the
USA's 101 to lose it. Offense becomes viable without becoming free.

```js
// campaignLogic.js — after cpCostAttacker is calculated
if (finalWinner === battle.attacker && previousOwner !== battle.attacker) {
  cpCostAttacker -= Math.round(cpCostAttacker * (campaign.settings?.captureRebate ?? 0.33));
}
```

Expose `captureRebate` in the Settings modal alongside the other cost knobs.

**C3 · Season victory conditions** *(the fix for §2.5)*

Declare season length up front (**8 turns** recommended) and resolve on the first of:

1. **Supply Collapse** — enemy SP ≤ 0 *(keep as-is)*
2. **Strategic Objectives** — hold 6 of 10 designated key regions at the end of one
   turn *and* the start of the next *(holding, not just taking)*
3. **Season End** — highest **Campaign Score** = `territory VP + (SP remaining / 10)`

Folding remaining supply into the score is the important part: it turns the economy
from a hidden clock into the visible scoreline. Season 1 would have read
**USA 176.5 – CSA 153.5** instead of 129–125 — a margin that actually describes
what happened.

Replace `checkTotalTerritorialControl` (unreachable at 137 regions) with the
objectives check.

**C4 · Key-region income concentration** *(the fix for R4)*

Designate ~10 **Objectives** — Harper's Ferry, Antietam, Frederick, DC, Baltimore,
Manassas, Fredericksburg, Winchester, Staunton, Wheeling — generating 10–15 SP/turn
each, and drop the 1–2 VP filler to 0–1. Territory then produces a real income
differential instead of 515-vs-515.

**C5 · Supply-line chains** *(best interest-per-line-of-code; mostly already built)*

`supplyLines.js` already has `isTerritorySupplied()` and `ISOLATED_DEFENSE_MULTIPLIER`.
Extend it: an unbroken chain of objectives back to your capital pays a bonus, and
cutting one link costs the enemy **the whole chain's income**. This is the RS2
"cut the trail" mechanic, it gives a reason to attack a worthless county, and it
makes the map's geography matter for the first time.

**C6 · Reduce the active theatre**

137 regions at 1.6 battles/turn is 85 turns of content. Lock all but a ~30-region
active theatre per season and rotate it between seasons. Same map asset, a board
that actually resolves.

---

## 5. Suggested order of adoption

| Phase | Change | Effort |
|---|---|---|
| **Season 2, day 1** | Part 1 settings + declare an 8-turn season | None — settings only |
| **Season 2, day 1** | C1 compressed multiplier + C2 capture rebate | ~1 hour |
| **Season 2** | Part 2 doctrine draft | ~1 day |
| **Season 2** | C3 victory conditions + Campaign Score | ~half day |
| **Season 3** | C4 objectives, C5 supply chains, C6 theatre lock | Map + logic work |

Phase 1 alone — settings, multiplier, rebate — would have turned Season 1 from a
190 SP blowout into a 27 SP race. Everything after that is about making the other
131 counties mean something.
