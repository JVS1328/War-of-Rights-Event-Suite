# Campaign Balance Audit — Maryland Campaign, Season 1

**Source data:** `campaign-Maryland-Campaign-Season-1-2026-09-18.json` (turn-5 export)
**Scope:** 137 territories, Eastern Theatre county map
**Export covers:** turns 1–5, 8 battles — USA 475 SP / CSA 285 SP · VP 129–125
**Actual finish:** two further battles after the export. **CSA reached 0 SP; USA won by
Supply Point Depletion.** The USA closed it out by *electing to defend their own
territory on their turn*, forcing the CSA into high-cost attacks.

> The quantitative sections below are computed from the 8 battles in the export. The
> final two battles are not in the data, so every figure here is a turn-5 snapshot —
> the trend it describes is what finished the campaign.

---

## 1. Executive summary

Season 1 was not decided by territory, and it was not decided by how the sides played.
It was decided by **which side was made to attack**.

The four headline numbers:

| Finding | Number |
|---|---|
| Difference in supply *income* between the two sides over the whole campaign | **0** (515 vs 515) |
| Share of the turn-5 190 SP gap created by the single Washington DC assault | **108%** (205 of 190; everything else netted 15 the other way) |
| Territories that ever changed hands, out of 137 | **6 (4.4%)** |
| Territory VP when the CSA ran out of supply | **CSA ahead, 136–129** |

Each side takes **one action per turn**: attack a region, or **elect to defend** one of
their own. Electing to defend forces the opponent to be the attacker — the defender also
picks the map — so it trades the risk of losing that region for a guaranteed higher
supply bill on the other side. It's a real trade and a good mechanic. The problem is
what the numbers do to it.

Two things happened, and they're the same thing twice:

1. The CSA captured the enemy capital on turn 4 and **that victory cost them the
   season.** They paid 285 SP for a region generating 7 SP/turn — a 41-turn payback.
   The USA paid 80 SP to lose it.
2. From turn 4 the USA stopped attacking and started electing to defend — and picked
   their *most valuable* region to defend, which forced the CSA into the single most
   expensive attack on the board, twice.

That is the whole audit in one line: **the risk side of the elective-defense trade is
underpriced.** Losing a 7-VP region costs you 7 SP/turn; forcing the enemy to attack it
costs them 285 in one night. The risk is nominally real and numerically irrelevant.

Formally, with attacker cost A and defender cost D per battle and A > D always:

|  | CSA attacks | CSA defends |
|---|---|---|
| **USA attacks** | A+D , A+D | 2A , **2D** |
| **USA defends** | **2D** , 2A | A+D , A+D |

Defending is better whatever the opponent does (`2D < A+D` and `A+D < 2A`), so **elect
to defend is a strictly dominant strategy.** The CSA didn't lose because they were
outplayed on the map — they lost because they kept choosing the option that is never
correct. The USA won from *behind* on territory, 129 to 136.

The goal is not to remove elective defense. It's to price the risk so that attacking is
sometimes the better call — which today it never is.

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

Why: starting VP is near-symmetric by design (129 vs 136), and only 6 regions flipped.
The two-turn transition window (§2.10) then means a captured region pays *nobody* while
it consolidates — so across a short season, captures never had time to show up as income.

The map is currently decorative. Note this is a scale problem, not a transition problem:
the fix is more captures and higher-value objectives, not a shorter transition.

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

**The fix already exists in this repo** — count tickets, not bodies. See §4/Part 4.

### 2.4 Winning and losing a defense cost the same

`calculateDefenderCPLoss()` accepts a `defenderWon` parameter and ignores it —
the JSDoc says so explicitly: *"no longer affects calculation"*. The original
`CP_SYSTEM_SPECIFICATION.md` had failed defense pay max cost; that was removed.

Consequence: a side that folds three defenses pays the same as one that holds three,
for the same casualties. There is no supply consequence for losing — only the territory.

### 2.5 Only one victory condition was reachable — and it fired

| Condition | Reachable in a season? |
|---|---|
| **Supply depletion (≤0)** | **Yes — this is what ended the campaign.** At turn 5 the CSA was ~2.5 turns out; it took two more battles. |
| Total territorial control | Requires **all 137** territories. Never. |
| Date victory (Dec 1865) | **Turn 30.** The campaign lasted ~7. |

Depletion working is fine. The problem is that it's the *only* thing that can end a
season, which makes **supply the sole scoreline** and territory decorative. The CSA was
ahead on territory (136–129) when they lost. Nothing in the rules could express that.

A season needs a second, positive condition that resolves on a schedule — see §4/C3.

### 2.6 Season length is not a design parameter — it's an accident of who attacked

The season was meant to run longer than it did. It couldn't, and the reason is
arithmetic:

| | spend/turn | income/turn | burn ratio | turns to 0 SP from 750 |
|---|---|---|---|---|
| USA | 158 | 128 | **1.23** | ~21 |
| CSA | 196 | 128 | **1.53** | **~9** |

Both sides started with the same pool and earned identical income. The *only* variable
was role: the CSA attacked 5 times, the USA 3. That difference alone set the campaign's
length at roughly seven turns.

> **Whoever attacks sets the clock.** Season length is currently an emergent property
> of the burn/income ratio, not something the admin can choose.

That is why a season intended to run long finished in seven turns, and it's also why
elective defense is so strong: declining to attack doesn't just save you supply, it
*extends your own clock while shortening theirs*.

### 2.7 The turn the strategy was found — visible in the data

Two battles per turn, one per side's action. So when *both* battles in a turn share an
attacker, the other side spent its action electing to defend. That shows up exactly once:

| Turn | Battle 1 | Battle 2 | USA paid | CSA paid |
|---|---|---|---|---|
| 1 | CSA → Loudoun | USA → N. Virginia | 197 | 153 |
| 2 | USA → Antietam | CSA → Harper's Ferry | 257 | 243 |
| 3 | CSA → Harper's Ferry | USA → N. Virginia | 168 | 187 |
| **4** | **CSA → Washington DC** | **CSA → Frederick** | **168** | **397** |

Turns 1–3 are one attack each — both sides trading, costs within ~40 SP of each other
every turn. On **turn 4 both attacks are CSA's**: the USA elected to defend, and the
cost gap blows out to **229 SP in a single turn**, more than the entire first three
turns combined.

And note *which* region the USA defended: **Washington DC, pv 7 — the most valuable
region they owned.** That's the second half of the exploit. The defender chooses the
territory, so they choose their highest point value, and the forced attacker pays
`base × pointValue` on it. The USA didn't just decline to attack; they picked the
most expensive possible bill and handed it over.

The CSA repeated the mistake on the same turn by spending their own action attacking
Frederick, paying 397 SP across the two battles against the USA's 168. Two more forced
attacks after the export finished them.

### 2.8 Abilities were lottery tickets, not decisions

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

### 2.9 Map scale vs. battle throughput

- 137 territories · 8 battles in 5 turns = **1.6 battles/turn**
- 131 territories (95.6%) never touched
- 109 of 137 are 1–2 VP filler
- Only ~29 sit on any frontline
- At this rate, touching every region once would take **85 turns**

The map promises a theatre and delivers a four-tile corridor: Harper's Ferry,
Northern Virginia, Frederick, DC.

### 2.10 What's already working — don't change it

**The two-turn capture transition (`captureTransitionTurns: 2`) is a good mechanic and
should stay at 2.** A freshly captured region spends the following turn transitioning:
it pays no SP and no VP to *either* side, and the previous owner can counter-attack
into it before it consolidates. That is a genuine tempo mechanic — it's what produced
the Harper's Ferry back-and-forth on turns 2–3, the most interesting sequence of the
season — and it correctly makes a capture something you have to *hold*, not just take.

It does interact badly with the attack economy, but the fault is on the economy side:
you pay the full attack cost now and see nothing for two turns. The fix is to pay the
attacker **at the moment of capture** (§4/C2), which works with the transition window
instead of against it — you seize their stores immediately, you collect the tax revenue
once the region settles.

Also working well and worth keeping:

- **Neutral-ground fights are already symmetric** (50/50 base). 6 of 8 battles used
  these rates, which is why the campaign stayed close until turn 4.
- **Isolation/supply-line penalties** (`isTerritorySupplied`, `ISOLATED_DEFENSE_MULTIPLIER`)
  are built and correct — they're just barely exercised on a map this size. See §4/C5.
- **Elective defense itself.** Choosing to fight on your own ground is a real strategic
  option and the USA played it well. It should remain viable; it just shouldn't be free.

### 2.11 Minor: data inconsistency worth a look

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
| **R1** | Attack base 75 vs defense base 25 on enemy soil, with **no reward for capturing** | Offense is never economically rational. **This was exploited:** the USA won by declining to attack. |
| **R2** | `pointValue` multiplies cost **linearly and uncapped** (1×–7×) | One capital assault = 38% of a starting pool. One battle ends a season. |
| **R3** | Casualty ratio is the only skill term, and it's near-constant | The WoR matches barely feed back into the campaign. |
| **R4** | 137 regions, ~29 contestable, 1.6 battles/turn, symmetric income | Territory generates no income differential. The map does nothing. |
| **R5** | Defender picks *which* of their regions to defend | They pick their highest `pointValue`, so the forced attacker always pays the maximum bill on the board. |
| **R6** | No turn cap, and depletion is the only reachable ending | Territory can't decide a season, so there's no counter-pressure on a side that simply refuses to attack. |

R1, R2 and R5 compound into the dominance result in §1: **elect to defend beats attack
whatever the opponent does.**

- **R1** sets `A > D` — forcing the other side to attack always costs them more.
- **R2** makes that gap scale linearly with point value, up to 7×.
- **R5** hands the defender the choice of *which* point value, so they always pick 7.

One important correction to a natural first reading: **this is not a stalemate risk.**
Because electing to defend still produces a battle, the equilibrium where both sides
defend every turn still runs 2 battles/turn and burns supply at the normal rate — it's
symmetric and the season resolves fine. The damage is subtler and worse:

> **The turn decision is illusory.** There is exactly one correct move, so the strategic
> layer collapses to a formality. Territory changes hands only when a *forced* attack
> happens to succeed — nobody ever chooses where the war goes.

Season 1 resolved because only one side worked this out. Season 2 resolves too, but if
both sides have read this document, no one will ever again choose to attack, and the
map will be decided entirely by accident.

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
| `captureTransitionTurns` | 2 | **2 — keep** | Deliberate tempo mechanic; see §2.10. Do not shorten. |

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

#### Choosing a season length

Once costs are rebalanced, season length becomes something you can actually set.
The relationship is:

```
turns to depletion  ≈  startingSP / ( battlesPerTurn × avgCostPerBattle − income )
```

At the proposed rates (avg ~85 SP per side per battle, income ~128/turn):

| starting SP | 1.5 battles/turn | 2.0 | 2.5 | 3.0 |
|---|---|---|---|---|
| 500 | never | 12 turns | 6 | 4 |
| **600** | never | **14 turns** | **7** | **5** |
| 750 | never | 18 turns | 9 | 6 |
| 900 | never | 21 turns | 11 | 7 |

Two things fall out of this:

1. **2 battles/turn is already the natural rate** — one action per side per turn, which
   is exactly what Season 1 produced (8 battles across 4 active turns). So the `b=2.0`
   row is the one to read; the others apply only if you change the action economy.
2. **600 SP at 2 battles/turn gives a 14-turn ceiling**, so a declared 10–12 turn
   season ends on the clock with depletion as a live threat rather than a certainty.
   That's the shape you want.

Schedule the battles per turn you can actually run, then pick starting SP from the
table — don't let it emerge.

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

> **Read Part 4 first.** Ticket-weighted supply replaces the base-cost table outright,
> which makes C1 and C2b unnecessary rather than merely lower priority. C2 (capture
> bounty) and C3 (victory conditions) survive intact and are still required. C1/C2b are
> kept here as the fallback if ticket data can't be collected reliably for every battle.

**C1 · Compress the point-value multiplier** *(highest impact, ~5 lines)*

`getVPMultiplier()` currently returns `pointValue / vpBase` — linear and uncapped, so
a 7-point capital costs 7× a 1-point county. Replace with a compressed curve:

```js
// cpSystem.js — getVPMultiplier()
return 1 + (pointValue - 1) * 0.5;   // 1pt=1×, 3pt=2×, 5pt=3×, 7pt=4×
```

Capitals stay the most expensive target on the board without being season-enders.
(Pair with the raised base costs in Part 1 to hold the overall burn rate.)

**C2 · Capture bounty** *(the fix for R1, ~4 lines)*

On a successful capture, grant the attacker an **immediate one-time windfall of
`pointValue × 20` SP** — seized depots, stores and rolling stock.

A bounty beats a percentage rebate here for two reasons:

- It **scales with what you took**, not with how badly the battle went. Grinding a
  cheap region shouldn't pay like storming a capital.
- It **pays at the moment of capture**, which is exactly what the two-turn transition
  window (§2.10) delays. You seize the stores now; the tax revenue arrives once the
  region consolidates. The two mechanics stop fighting each other.

**Setting the rate — the design target.** Choosing to attack instead of electing to
defend costs you exactly `A − D` extra and buys you one extra chance at a capture. So
the choice is live when:

```
A − D   ≈   P(win) × ( bounty × pointValue  +  incomeSwing × turnsRemaining )
```

Tuned against the proposed rates (atk 110 / def 55, compressed multiplier, 50% win,
5 turns left):

| pv | A − D | E[capture] @ bounty 20 | @ 25 |
|---|---|---|---|
| 3 | 55 | 45 | 52 |
| 5 | 82 | 75 | 88 |
| 7 | 110 | **105** | 122 |

**Start at 20/VP** — it lands within ~10% of parity across the map, so neither option
dominates and the call depends on the board. It also produces a natural seasonal arc:
early on, `turnsRemaining` is large and attacking is clearly worth it; late, the income
term shrinks and elective defense comes into its own. Raise toward 25 if Season 2 still
looks too passive.

Applied to the DC assault under the Part 1 rates: cost **239**, bounty 140 → **net 99**,
against the USA's 101 to lose it. Win an attack and you pay roughly what the defender
paid; lose it and you pay 2.4× — and you still have to *hold* the region through a
transition turn against the counter-attack. Taking the enemy capital finally reads as a
triumph instead of a self-inflicted wound.

**C2b · Let the attacker pick the target** *(the fix for R5)*

Compression alone cuts the elective-defense payoff substantially — the DC bill drops
from 285 to 239, and the ratio from 3.6:1 to 2.4:1 — but it doesn't touch the underlying
exploit, which is that the *defender* chooses which region is fought over and therefore
sets the attacker's bill.

Split the choice:

1. The defending side declares **"elect to defend"** (their turn action)
2. The **attacker picks the target** from that side's frontline regions
3. The **defender picks the map**, as now

Both sides keep real agency, the mechanic survives intact, and defending your 7-pointer
stops being a free 285 SP invoice. This is a rules change rather than a code change and
can ship for Season 2 immediately.

```js
// campaignLogic.js — after cpCostAttacker is calculated
const bountyRate = campaign.settings?.captureBounty ?? 20;
if (finalWinner === battle.attacker && previousOwner !== battle.attacker) {
  cpCostAttacker -= territoryVP * bountyRate;   // may go negative = net gain
}
```

Expose `captureBounty` in the Settings modal. **Anti-farming guard:** suppress the
bounty if the same side captured that region within the last 3 turns, so a region
can't be traded back and forth for income.

**C3 · Season victory conditions** *(the fix for §2.5 and R6)*

Declare season length up front — **10 turns** — and resolve on the first of:

1. **Supply Collapse** — enemy SP ≤ 0 → immediate loss *(keep exactly as-is; it worked)*
2. **Strategic Objectives** — hold 6 of 10 designated key regions at the end of one
   turn *and* the start of the next *(holding, not just taking)*
3. **Turn 10** — highest **territory VP**, with remaining SP as the tiebreaker

**The scoring detail matters.** Score on territory VP, *not* on VP + SP. Electing to
defend is the cheaper option, so a side that always defends ends the season with the
larger pool; counting that pool toward the score would reward the dominant strategy a
second time. With VP as the scoreline and SP only as a tiebreaker:

- The side **ahead** on territory can afford to keep defending — legitimate, and
  historically correct for the Union.
- The side **behind** on territory has to attack before the clock runs out, which is
  what puts the `A − D` premium back on the table as a real cost of being behind.
- Running out of supply still loses outright, so elective defense stays a real weapon.

This is the piece that gives the C2 bounty something to push against. The bounty makes
attacking *affordable*; the turn cap and VP scoreline make it *necessary*.

Check it against Season 1: at the point the CSA collapsed, territory stood at
**CSA 136 – USA 129**. Under a turn cap the USA *could not have defended their way to
victory* — they were behind on the board and would have had to come out and attack
before turn 10. They'd have had to earn it. That is precisely the pressure the season
was missing.

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

### Part 4 — Ticket-weighted supply (Season 2's headline change)

War of Rights already buckets every death by the stance it happened in, and the
repo already parses and weights it:

| Stance | Ticket weight |
|---|---|
| In Formation | **1** |
| Skirmish | **3** |
| Out of Line | **5** |

`log-analyzer/src/scoreboard/parseScoreboard.js` reads `victim_formation` per kill;
`analytics/eventStats.js` buckets it into `dForm / dSkirm / dOob` per unit; and
`stats/labels.ts` already exports the exact function needed:

```ts
export function ticketDamage(inForm: number, skirm: number, oob: number): number {
  return TICKET_WEIGHT.in_form * inForm + TICKET_WEIGHT.skirm * skirm + TICKET_WEIGHT.oob * oob;
}
```

It's deliberately **additive across players and units**, so a side's total is just the
sum of its regiments'. Nothing new needs building — the number just has to reach the
campaign tracker, which today takes a single casualty count per side
(`BattleRecorder.jsx:293`).

**Replace the cost formula with:**

```
SP loss = ticketDamage(inFormation, skirmish, outOfLine)
```

No base costs. No attacker/defender rates. What your men cost you *is* the bill.

#### Why this is the most valuable change available

**It fixes R3 directly.** Today the cost split between two sides is mathematically
trapped near even — the observed range across eight battles was 0.436–0.559. Ticket
weighting multiplies the casualty term by a discipline term (`avgTd`, 1.0–5.0), and the
two compound:

| | best case | worst case | spread |
|---|---|---|---|
| Casualty share (today) | 0.436 | 0.559 | 1.28× |
| Ticket share (proposed) | ~0.25 | ~0.75 | **~3.0×** |

A side that holds formation and a side that scatters can now end a 50/50 casualty
battle paying **70/30**. That is the campaign layer finally reading what happened in
the match.

**And it dissolves the dominance result in §1 at the root.** The payoff matrix only
collapses because `A > D` is *guaranteed by the formula*. Under ticket costs there is
no structural attacker premium at all — the attacker pays more only if the attack
actually goes worse, which is a thing they can control. Elective defense stops being a
free 285 SP invoice and becomes what it should be: a bet that you'll fight better on
your own ground. **This is a cleaner fix than C1, C2b and the base-cost table combined**,
and it lets you delete all four base-cost settings.

> **Calibrate before assuming.** It's likely that attacking costs more tickets — crossing
> open ground produces Out of Line deaths — but Season 1's raw casualties were ~50/50
> regardless of role, so this is unverified. Measure attacker vs defender `avgTd` over
> the first 3–4 battles of Season 2. If they come out genuinely symmetric, add a small
> explicit attacker multiplier (×1.10–1.20), not the current 3:1.

#### Scale

Ticket damage runs ~20–25× larger than current SP costs, which is why starting supply
has to go up a lot — as intended. A typical Season 1 battle (~2,400 total casualties) at
an average ×2.2 ticket cost is ~5,300 ticket damage, ~2,650 per side.

| Quantity | Value |
|---|---|
| SP loss per side per battle | ~2,650 |
| Battles per side per turn | 2 |
| Burn per side per turn | **~5,300** |
| Income (territory VP × 20/turn) | ~2,600 |
| Net burn per turn | ~−2,700 |
| **Starting SP for a 10–12 turn season** | **~30,000** |

Income has to be rescaled by the same factor or it stops mattering — `pointValue × 20`
per turn keeps it at roughly 40–50% of burn, which is where it was in Season 1.

**Treat every constant here as provisional.** They're derived from Season 1 casualty
counts and an *assumed* ×2.2 average ticket cost. Pull the real `avgTd` from the first
few Season 2 battles and re-derive; the structure is what matters, not these numbers.

#### Implementation

1. `BattleRecorder.jsx` — three casualty inputs per side (IF / Sk / OoL) instead of one.
   Ideally paste-import from the log analyzer so it's not hand-entry.
2. `cpSystem.js` — `calculateBattleCPCost` returns `ticketDamage()` per side; the four
   base-cost constants and the VP multiplier become unnecessary.
3. Store the three buckets on the battle record so past battles stay auditable.

### Part 5 — Capital victory and the western flank

#### C7 · Capital victory

The map already carries four capitals, all pv 7, and this condition was **one region
away from firing in Season 1**:

| Capital | Original owner | Status at CSA collapse |
|---|---|---|
| Washington DC | USA | **captured by CSA, turn 4** |
| Philadelphia | USA | USA |
| Richmond | CSA | CSA |
| Petersburg | CSA | CSA |

The CSA held **three of the four capitals** and needed only Philadelphia. They ran out
of supply instead, and nothing in the rules could express how close that was.

> **Condition:** hold every enemy capital simultaneously at the end of a turn, after
> transitions resolve. Immediate win.

The two-turn transition makes this a genuine test — you have to hold both through a
counter-attack window, not just touch them. And Philadelphia is a good final objective:
**4 steps from the nearest CSA holding with only 2 adjacent regions**, so it's a real
drive down a narrow approach rather than a walk.

This is also the reachable replacement for `checkTotalTerritorialControl`, which needs
all 137 regions and can never fire.

#### C8 · Merge the western map

The case for this is stronger than it looks:

| Region | Territories | VP | Battles ever fought | 1–2 VP filler |
|---|---|---|---|---|
| Pennsylvania | 35 | 64 | **0** | 31 / 35 |
| West Virginia | 26 | 44 | **1** | 24 / 26 |
| **Total** | **61 (45% of map)** | **108 (38% of VP)** | **1** | **55 / 61** |

Forty-five percent of the board and over a third of all victory points produced a single
battle in seven turns. Not because players ignored it — because a 1 VP county is worth
nothing to take and nothing to lose.

**Merge PA 35 → ~10 regions and WV 26 → ~8**, at 5–7 VP each. Same geography, same map
asset, but each western region becomes worth roughly what Harper's Ferry is worth today,
and with the C2 capture bounty scaling on `pointValue`, taking one actually pays.

The reason this creates a flank rather than just bigger scenery is C7. Merged regions
give the western axis a **destination**:

- **Eastern approach to Philadelphia** — through Maryland and Baltimore. Short, and every
  region on it is contested.
- **Western approach** — through West Virginia into western Pennsylvania. Longer, but
  currently 61 undefended regions deep.

A side losing the Maryland corridor gets a real alternative instead of grinding the same
four counties. That is the single biggest available gain in *interest* per unit of work,
and it's map data rather than logic.

---

## 5. Suggested order of adoption

**Track A — ticket-weighted supply (recommended).** Part 4 replaces the cost formula,
so Part 1's base-cost settings, C1 and C2b all fall away.

| Phase | Change | Effort |
|---|---|---|
| **S2 prep** | **Part 4** — ticket costs, 3 casualty inputs per side, rescaled pools | ~1 day |
| **S2 prep** | **C3** turn cap (10 turns) + VP scoreline, **C7** capital victory | ~1 day |
| **S2 prep** | **C2** capture bounty *(recalibrate to ticket scale)* | ~1 hour |
| **S2 prep** | **C8** merge PA and WV | Map data |
| **S2, turn 3** | Recalibrate constants against real `avgTd` from the first battles | — |
| **Season 2** | Part 2 doctrine draft | ~1 day |
| **Season 3** | C4 objectives, C5 supply chains, C6 theatre lock | Map + logic |

**Track B — fallback, if ticket data can't be collected every battle.** Part 1 settings
+ C1 + C2b + C2 + C3, shipped together. They're four terms of one inequality — C2b and
C1 shrink `A − D`, C2 raises what a capture is worth, C3 makes you need one — and any
one alone leaves elect-to-defend dominant.

Either track, **C3 is non-negotiable**: without a turn cap and a territory scoreline,
being behind on the map costs nothing and there's no reason to attack at all.

Three things should ship regardless of track, because they're additive rather than
corrective: **C7** (capital victory — it nearly fired in Season 1 and no rule could see
it), **C8** (the western merge — 45% of the board produced one battle), and the **Part 2
doctrine draft** (the identity layer, and the thing that was actually asked for).

---

## 6. Implementation status

Shipped (Season 2 ready):

| Item | Where |
|---|---|
| **Part 4** — ticket-weighted supply | `cpSystem.js`, `BattleRecorder.jsx` |
| **C1** — compressed VP multiplier | `cpSystem.js` `getVPMultiplier(.., 'compressed')` |
| **C3** — season turn cap + VP scoreline | `victoryConditions.js` `checkSeasonEnd` |
| **C7** — capital victory | `victoryConditions.js` `checkCapitalVictory` |
| **C8** — western merge (PA 35→10, WV 26→8) | `marylandCampaign1862.js` |
| **C2** — capture bounty | `campaignLogic.js`, 600 SP per VP |

All of it is **on by default for any newly created campaign**, defined once as
`SEASON_RULESET` in `defaultCampaign.js`: ticket costs, compressed multiplier,
40,000 SP pools, income 20/VP, 600/VP capture bounty, 10-turn season, capital
victory. Existing campaigns are untouched — the settings normaliser defaults
every one of these off, so a save without the keys keeps its old behaviour, and
legacy mode still reproduces Season 1's Washington DC battle exactly at 285/80.

### C2b is a league rule, not code

The tracker has no concept of whose turn it is — outside Grand Campaign there's
no `activeSide`, and any side can be recorded as the attacker anywhere. So
"the defender declares, the **attacker** picks which frontline region gets
fought over, the defender still picks the map" needs nothing implemented. Agree
it in Discord and record the battle as normal.

It matters more than it looks. Keeping the attacker/defender base costs means
`A > D` still holds by construction, so **defending your highest-value region is
still the strongest single move**, and ticket weighting adds skill leverage on
top of that asymmetry rather than removing it.

The capture bounty cannot close that gap on its own. Both the bounty and the
attack cost scale with point value, so 600/VP offsets roughly half of any
attack, from a 1-point county to a 7-point capital. But equalising the *choice*
between attacking and electing to defend would need a bounty near 1,400/VP —
which makes a successful attack cost nothing at all. At a 75/25 split there is
no bounty that balances the decision without breaking it.

So the rule does the work the numbers can't: it takes away the defender's
ability to name the price. Either that, or narrow the base costs (75/25 → 60/35)
— but not neither.

**Still open:**

- **Part 2** — the doctrine draft.
- **C4, C5, C6** — objectives, supply chains, theatre lock.

Two side effects worth knowing about:

- The map carried **19 one-way adjacency links** (e.g. `va-fauquier → va-loudoun`
  with no return edge). With `requireAdjacentAttack` on, an attack was legal in
  one direction and illegal in the other. All 19 are now symmetric.
- Every constant in Part 4 is still derived from an **assumed ×2.2 average ticket
  cost**. The first real battles will move them.

---

## 7. Open items

- **Get the complete export.** Everything quantitative here stops at turn 5; the final
  two battles that took the CSA to 0 aren't in the data. Worth re-running §2.1–2.3
  against the finished file to confirm the burn-ratio figures in §2.6.
- **Pull real `avgTd` figures** from any Season 1 logs still on hand. Every constant in
  Part 4 rests on an assumed ×2.2 average ticket cost; one real battle's worth of
  IF/Sk/OoL splits would replace the assumption and let the pools be set properly
  rather than estimated.
- **Measure the attacker/defender ticket gap** over Season 2's first 3–4 battles before
  deciding whether any explicit attacker multiplier is needed at all.
- **Confirm the `va-fairfax` capture-history bug** (§2.10) before Season 2 setup.
- **Decide the schedule first.** The season-length table in Part 1 is driven by battles
  per turn, which is a scheduling constraint rather than a design choice — pick what
  the league can realistically run each week, then set starting SP from it.
