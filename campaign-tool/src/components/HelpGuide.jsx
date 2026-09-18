import { useState } from 'react';
import { HelpCircle, X, ChevronDown, ChevronRight, Map, Swords, Trophy, Zap, Clock, Target, Flag, Train, Waves, Shield, Package, Coins, Users, ScrollText } from 'lucide-react';

const HelpGuide = ({ isOpen, onClose, campaignStyle = 'standard' }) => {
  const isGrand = campaignStyle === 'grand';
  const [expandedSections, setExpandedSections] = useState({
    // Grand Campaign sections
    gcOverview: isGrand,
    gcSetup: false,
    gcTurn: false,
    gcMovement: false,
    gcCombat: false,
    gcReplenishGarrison: false,
    gcVictory: false,
    // Shared sections
    dispatch: false,
    // Legacy sections
    overview: !isGrand,
    howToPlay: false,
    spSystem: false,
    battles: false,
    commanders: false,
    abilities: false,
    victory: false,
    tips: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (!isOpen) return null;

  const Section = ({ id, title, icon: Icon, children }) => (
    <div className="ui-line mb-2" data-open={expandedSections[id]}>
      <button
        onClick={() => toggleSection(id)}
        className="ui-line-head px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-brass-400" />
          <span className="font-semibold text-mist-100 text-sm">{title}</span>
        </div>
        {expandedSections[id] ? (
          <ChevronDown className="w-5 h-5 text-mist-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-mist-400" />
        )}
      </button>
      {expandedSections[id] && (
        <div className="ui-line-body text-mist-300 text-sm leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal max-w-3xl">
        {/* Header */}
        <div className="ui-modal-head">
          <div>
            <div className="ui-modal-title">
              <HelpCircle className="w-5 h-5" />
              {isGrand ? 'Grand Campaign Guide' : 'Campaign Tracker Guide'}
            </div>
            <p className="ui-hint mt-0.5">
              {isGrand
                ? 'Tabletop ruleset adaptation — tokens, movement, combat, victory'
                : 'For War of Rights regiment leaders'}
            </p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-quiet ui-btn-icon" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="ui-modal-body ui-scroll flex-1">
          {isGrand && (
            <>
              <Section id="gcOverview" title="Grand Campaign — Overview" icon={Map}>
                <p className="mb-3">
                  Grand Campaign adapts Maj. Tindall's tabletop ruleset to this app.
                  Instead of territory-for-VP, both sides push <strong>tokens</strong> (1:1 with
                  your regiments) around the Eastern Theatre map. Victory Points come
                  from <strong>capital captures</strong> and <strong>token wipes</strong>, not from owning ground.
                  Territory colour is flavour: tokens sitting in a territory slowly
                  shift its influence toward their side over months.
                </p>
                <p className="mb-3">
                  Each side has a national <strong>treasury</strong> and <strong>manpower pool</strong>; both grow
                  monthly per owned city. You'll see the live figures and per-month
                  adds in the sidebar TurnTracker.
                </p>
                <p className="text-mist-400 text-xs">
                  Every number you see here — starting strength, pool sizes, movement
                  rates, casualty modifiers, VP to win — is tunable under Settings →
                  Grand Campaign.
                </p>
              </Section>

              <Section id="gcSetup" title="Setup — Coin Flip & Placement" icon={Flag}>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Draw your map first: use <strong>Edit Map Features</strong> to drop cities,
                      forts, rail stations, railway polylines, and rivers.
                      Capitals get a gold ring. Railways must start at a city, fort,
                      or rail station and snap to anchors as you draw.</li>
                  <li>Add one <strong>token</strong> per regiment, each side, using the sidebar.
                      Rename/edit anytime.</li>
                  <li>Hit <strong>Begin Setup</strong>. A coin is flipped (Heads = USA, Tails = CSA).
                      The winner draws their first token from the bag and places it
                      by clicking the map — placement is restricted to friendly
                      territory. Sides alternate until every token is placed.</li>
                  <li>Month 1 begins. The first drawer of each month flips between
                      sides (it's always the opposite of last month's starter).</li>
                </ol>
              </Section>

              <Section id="gcTurn" title="Turn Flow — Drawing & Ending" icon={Clock}>
                <p className="mb-3">
                  Each month, token tiles are drawn one at a time from their side's
                  bag, alternating sides. Click <strong>Draw Next Token</strong> in the TurnTracker
                  to bring up that token for its turn. A token already in a pending
                  battle is auto-skipped to the discard pile.
                </p>
                <p className="mb-3">
                  During a token's turn you can: <strong>Move</strong>, <strong>Attack</strong>, <strong>Board Rail</strong>,
                  <strong> Embark River</strong>, <strong>Disembark</strong>, <strong>Replenish</strong>, <strong>Garrison</strong>, or simply hit
                  <strong> End</strong>. Each button only shows when the action is legal for that
                  token's current situation.
                </p>
                <p>
                  When both bags empty, the month rolls over automatically: income
                  ticks in, manpower regens per city, bags refill, the first drawer
                  flips sides. The real calendar date advances one month.
                </p>
              </Section>

              <Section id="gcMovement" title="Movement — Miles, MP, Rail & River" icon={Train}>
                <p className="mb-3">
                  Every token has <strong>2 movement points</strong> per turn (tunable). Distances
                  are shown in <strong>miles</strong>, with each mode granting a different mi/MP rate.
                  Click <strong>Move</strong> — a dashed ruler follows your cursor showing live
                  distance, MP cost, and mode. Confirm by clicking the destination.
                </p>
                <p className="mb-3">
                  <strong>March</strong> is the default. River crossings on a march add +1 MP each.
                  The ruler stays active between marches as long as you have MP.
                </p>
                <p className="mb-3">
                  <strong>Rail</strong> and <strong>river</strong> movement aren't automatic — they're <em>explicit</em>
                  actions:
                </p>
                <ul className="list-disc pl-5 space-y-1 mb-3">
                  <li><strong>Board Rail</strong> — must be at a city, fort, or rail station that's on
                      a railway. Ends the turn.</li>
                  <li><strong>Embark River</strong> — must be adjacent to a river. Ends the turn.</li>
                  <li>Once boarded, all movement is locked to that rail/river polyline
                      until you <strong>Disembark</strong>. Trying to move off it shows a red "must
                      disembark first" warning on the ruler.</li>
                  <li><strong>Disembark</strong> drops you where you stopped and ends the turn.</li>
                </ul>
                <p className="text-mist-400 text-xs">
                  You cannot attack from a train or river — disembark first, then
                  attack next turn.
                </p>
              </Section>

              <Section id="gcCombat" title="Combat — Attack, Support, Resolve" icon={Swords}>
                <p className="mb-3">
                  A token's <strong>Attack</strong> button appears when enemy tokens are within
                  combat adjacency. The attack modal walks you through:
                </p>
                <ol className="list-decimal pl-5 space-y-2 mb-3">
                  <li><strong>Target + Supporters.</strong> Pick the defender; each side may optionally
                      add <strong>one</strong> supporter within support range (max 4 tokens total).</li>
                  <li><strong>Terrain / Weather / Time.</strong> Weighted rolls based on the defender's
                      territory and campaign settings. Re-roll or manually override.</li>
                  <li><strong>Map Pick/Ban.</strong> 3 maps are drawn from the rolled terrain's pool
                      (cooldown-aware). Defender bans 1, attacker picks 1.</li>
                </ol>
                <p className="mb-3">
                  The battle is now <strong>pending</strong> and the attacker's turn ends. Go play
                  War of Rights; when you return, open the battle from the History
                  list and hit <strong>Resolve</strong>. You enter <em>raw</em> WoR casualties; the tool
                  applies modifiers (fatigue +5%/pt, winter attacker +25%, train/river
                  +15%) and subtracts the result from engaged tokens. Supporters
                  absorb 40% of their side's total.
                </p>
                <p className="mb-3">
                  <strong>Last Stand</strong> (100–500 manpower) kicks in automatically. A LS token
                  caps enemy casualties at 2× its strength; if it wins, it takes zero
                  casualties and retreats 4 march-MP. If it loses, it's wiped
                  outright. LS tokens can't attack, reinforce, or capture.
                </p>
                <p>
                  Losing the battle auto-retreats the engaged token 4 march-MP toward
                  its nearest friendly city/fort. A wipe (&lt;100 manpower) awards the
                  enemy +{2} VP and drops the token from the map (still visible in
                  the roster, marked WIPED).
                </p>
              </Section>

              <Section id="gcReplenishGarrison" title="Replenishment & Garrison" icon={Package}>
                <p className="mb-3">
                  <strong>Replenish</strong> — only at a friendly city or fort. The modal lets you
                  buy men in 100-unit blocks at <em>replenishMoneyCost</em> treasury +
                  <em> replenishManpowerCost</em> national manpower per block. Live cost preview,
                  capped by whichever pool runs out first. Ends the turn.
                </p>
                <p className="mb-3">
                  <strong>Garrison</strong> — at a friendly city or fort, detach up to 500 men from
                  your token into the feature, or recall them. Ends the turn. On
                  attack, the garrison absorbs defender casualties first and inflicts
                  +100 attacker casualties per 100 garrison men (counter-fire).
                </p>
              </Section>

              <Section id="gcVictory" title="Victory Conditions" icon={Trophy}>
                <p className="mb-3">
                  First side to <strong>10 VP</strong> wins (tunable). VP comes from two events:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Capital capture</strong> — walk an active token into an undefended
                      enemy capital (a city flagged as a capital). +2 VP + $750.</li>
                  <li><strong>Token wipe</strong> — reduce an enemy token below 100 manpower. +2 VP.</li>
                </ul>
                <p className="mt-3 text-mist-400 text-xs">
                  Capital-capture VP is re-awarded every time a capital flips sides,
                  so recapturing a lost capital pays out again.
                </p>
              </Section>
            </>
          )}

          <Section id="dispatch" title="Turn Dispatch — the end-of-turn write-up" icon={ScrollText}>
            <p className="mb-3">
              The <strong className="text-brass-400">Dispatch</strong> button in the top bar reads a turn back
              as a period field report: the weather and light each battle was fought under, who led the attack,
              what it cost both sides in men and SP, what changed hands, and how the war looks heading
              into the next month.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>It opens on its own when you {isGrand ? 'roll into a new month' : 'click "Advance Turn"'},
                  showing the turn that just closed.</li>
              <li>Use the arrows in the footer to page back through earlier turns.</li>
              <li><strong>Copy for Discord</strong> puts the whole dispatch on your clipboard with markdown
                  formatting intact, ready to paste into your campaign channel.</li>
              <li><strong>Copy + map link</strong> does the same and appends a share link to the live map,
                  so readers can click through to the current campaign state.</li>
            </ul>
            <p className="mt-3 text-mist-400 text-xs">
              The wording varies from battle to battle but never changes for the same battle, so a dispatch you
              posted last week still matches what the tracker shows today.
            </p>
          </Section>

          <Section id="overview" title={isGrand ? 'Legacy Campaign Notes' : 'What is the Campaign Tracker?'} icon={Map}>
            <p className="mb-3">
              The <strong className="text-brass-400">Campaign Tracker</strong> is a strategic meta-game layer for War of Rights events.
              It allows regiment leaders to fight for control of territories across a campaign map, with each battle in War of Rights
              affecting the overall strategic situation.
            </p>
            <p className="mb-3">
              Think of it like a board game where the "battles" are resolved by actually playing War of Rights matches.
              Your regiment's performance in-game directly impacts whether you capture or hold territories on the campaign map.
            </p>
            <div className="bg-ink-800 p-3 rounded-lg mt-3">
              <p className="text-brass-400 font-semibold mb-2">Key Concepts:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Territories</strong> - Regions on the map worth Victory Points (VP)</li>
                <li><strong>Supply Points (SP)</strong> - Your strategic resource for fighting battles</li>
                <li><strong>Turns</strong> - Campaign time advances in 2-month increments</li>
                <li><strong>Victory</strong> - Achieved by depleting enemy SP, controlling all territories, or having the most VP at war's end</li>
              </ul>
            </div>
          </Section>

          <Section id="howToPlay" title="How to Play" icon={Target}>
            <div className="space-y-4">
              <div>
                <p className="text-brass-400 font-semibold mb-2">1. Choose Your Target</p>
                <p>Select a territory to attack. You can attack neutral territories or enemy-held territories.
                Some campaigns require attacking adjacent territories only.</p>
              </div>
              <div>
                <p className="text-brass-400 font-semibold mb-2">2. Play the Battle</p>
                <p>Organize your War of Rights match. The attacking side picks the map (from available options).
                Play the match and record the results - who won and casualties on each side.</p>
              </div>
              <div>
                <p className="text-brass-400 font-semibold mb-2">3. Record the Battle</p>
                <p>Use the "Record Battle" button to log the results. The tracker will calculate SP costs for both sides
                based on the territory value, casualties, and outcome.</p>
              </div>
              <div>
                <p className="text-brass-400 font-semibold mb-2">4. Advance the Turn</p>
                <p>When ready to move to the next campaign phase, click "Advance Turn". This:</p>
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>Moves the campaign date forward 2 months</li>
                  <li>Generates SP for each side based on controlled territories</li>
                  <li>Reduces ability cooldowns</li>
                  <li>Opens the Turn Dispatch for the turn that just closed, ready to copy into Discord</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="spSystem" title="Supply Points (SP) System" icon={Zap}>
            <p className="mb-3">
              SP represents your army's strategic strength and ability to wage war. Running out of SP means defeat!
            </p>

            <div className="space-y-3">
              <div className="bg-union-900 bg-opacity-30 p-3 rounded-lg border border-union-500">
                <p className="text-union-400 font-semibold mb-2">📊 Understanding VP Multiplier</p>
                <p className="mb-2">
                  The VP Multiplier dynamically scales SP costs based on territory value:
                </p>
                <div className="bg-ink-850 p-2 rounded mt-2 font-mono text-xs">
                  <p className="text-brass-400 mb-1">Formula: VP Multiplier = Territory VP ÷ 5</p>
                  <p className="text-mist-400 mb-2">This works for ANY VP value, not just 5/10/15:</p>
                  <ul className="list-disc list-inside space-y-1 text-mist-300">
                    <li>5 VP = 1.0× multiplier</li>
                    <li>7 VP = 1.4× multiplier</li>
                    <li>10 VP = 2.0× multiplier</li>
                    <li>12 VP = 2.4× multiplier</li>
                    <li>15 VP = 3.0× multiplier</li>
                    <li>20 VP = 4.0× multiplier</li>
                  </ul>
                </div>
                <p className="text-green-400 text-xs mt-2 italic">
                  💡 Why? More valuable territories are harder to take and more costly to fight over.
                  The system scales smoothly for custom VP values, making it flexible for any campaign setup!
                </p>
              </div>

              <div className="ui-box p-3">
                <p className="text-brass-400 font-semibold mb-2">SP Costs (Attackers)</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Attacking Neutral:</strong> Base 50 SP × VP multiplier × (your casualties ÷ total casualties)</li>
                  <li><strong>Attacking Enemy:</strong> Base 75 SP × VP multiplier × (your casualties ÷ total casualties)</li>
                </ul>
                <p className="text-mist-400 text-xs mt-2">
                  VP Multiplier = Territory VP ÷ 5 (e.g., 10 VP = 2x multiplier)
                </p>
                <p className="text-green-400 text-xs mt-2 italic">
                  💡 Why? Attackers pay more because they're the aggressors - they must commit more resources to take territory.
                  Enemy territories cost even more (75 vs 50) because they're fortified and defended.
                </p>
              </div>

              <div className="ui-box p-3">
                <p className="text-brass-400 font-semibold mb-2">SP Costs (Defenders)</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Defending Friendly Territory:</strong> Base 25 SP × VP multiplier × (your casualties ÷ total casualties)</li>
                  <li><strong>Defending Neutral Territory:</strong> Base 50 SP × VP multiplier × (your casualties ÷ total casualties)</li>
                </ul>
                <p className="text-mist-400 text-xs mt-2">
                  Defender SP loss scales with their proportion of total casualties - the more you bleed, the more SP you lose.
                </p>
                <p className="text-green-400 text-xs mt-2 italic">
                  💡 Why? Defending your own territory is cheaper (25) because you have home advantage, supply lines, and fortifications.
                  Defending neutral ground costs more (50) because you lack these advantages - you're fighting away from home.
                </p>
              </div>

              <div className="ui-box p-3">
                <p className="text-brass-400 font-semibold mb-2">Casualty Ratio Matters!</p>
                <p className="mb-2">
                  Both attackers and defenders pay SP based on the proportion of casualties they take:
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>If you take 50% of total casualties, you pay 50% of max SP cost</li>
                  <li>If you take 80% of total casualties, you pay 80% of max SP cost</li>
                  <li>Win or lose, heavy casualties mean heavy SP losses</li>
                </ul>
                <p className="text-orange-400 text-xs mt-2 italic">
                  ⚠️ Pyrrhic victories hurt! Even if you win, taking massive casualties can cripple your campaign.
                </p>
              </div>

              <div className="ui-box p-3">
                <p className="text-brass-400 font-semibold mb-2">SP Generation</p>
                <p>Each turn, you gain SP equal to the total VP of territories you control.
                Holding valuable territories is crucial for sustaining your war effort!</p>
              </div>
            </div>
          </Section>

          <Section id="battles" title="Battle Outcomes" icon={Swords}>
            <div className="space-y-3">
              <div>
                <p className="text-brass-400 font-semibold mb-2">If the Attacker Wins:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>The territory changes ownership to the attacker</li>
                  <li>VP is transferred immediately (or gradually, depending on settings)</li>
                  <li>Both sides pay SP based on casualties</li>
                </ul>
              </div>

              <div>
                <p className="text-brass-400 font-semibold mb-2">If the Defender Wins:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>The territory remains with its current owner</li>
                  <li>If it was neutral: may flip to the defender (configurable)</li>
                  <li>Both sides still pay SP based on casualties</li>
                </ul>
              </div>

              <div className="ui-box p-3">
                <p className="text-brass-400 font-semibold mb-2">Map Cooldowns</p>
                <p>After a map is played, it goes on cooldown for 2 turns. This prevents the same battlefield
                from being used repeatedly and encourages variety.</p>
              </div>
            </div>
          </Section>

          <Section id="commanders" title="Rolling for Commanders" icon={Users}>
            <p className="mb-3">
              Regiments added in Settings form a commander pool for each side. You can roll for
              who leads a battle from two places, and both share the same pool:
            </p>

            <div className="space-y-3">
              <div className="ui-box p-3">
                <p className="text-brass-400 font-semibold mb-2">On the campaign map</p>
                <p>
                  The <span className="text-white font-semibold">Battle Commanders</span> panel next to
                  the map rolls USA and CSA ahead of time — handy for deciding who commands the first
                  map of the turn before anyone picks a target. Rolling immediately takes that regiment
                  out of the pool, and "Set Up Battle" opens the recorder with both sides filled in.
                </p>
              </div>

              <div className="ui-box p-3">
                <p className="text-brass-400 font-semibold mb-2">In the Battle Recorder</p>
                <p>
                  The same spinner appears while recording a battle. Anyone rolled on the map is
                  already selected; "Change" returns that regiment to the pool so you can spin or
                  pick again.
                </p>
              </div>

              <div className="ui-box p-3">
                <p className="text-brass-400 font-semibold mb-2">Pool rotation</p>
                <p>
                  A regiment stays out of the pool until every other regiment on its side has had a
                  turn. The pool then refills with the whole roster, including whoever just led —
                  but they sit out the very next draw so nobody commands two battles running.
                  Editing the regiment roster in Settings resets both pools and clears any pending
                  roll.
                </p>
              </div>
            </div>
          </Section>

          <Section id="abilities" title="Special Abilities" icon={Zap}>
            <p className="mb-3">Each side has a unique ability that can turn the tide of a campaign:</p>

            <div className="space-y-3">
              <div className="bg-union-900 bg-opacity-30 p-3 rounded-lg border border-union-500">
                <p className="text-union-400 font-semibold mb-2">USA: Special Orders 191</p>
                <p>When activated during an attack, if USA wins, the CSA defender loses <strong>3× their normal SP cost</strong>.
                Represents capturing Confederate battle plans, as happened before Antietam.</p>
              </div>

              <div className="bg-rebel-900 bg-opacity-30 p-3 rounded-lg border border-rebel-500">
                <p className="text-rebel-400 font-semibold mb-2">CSA: Valley Supply Lines</p>
                <p>When activated during an attack, the CSA attacker pays <strong>only 50% of normal SP cost</strong>.
                Represents efficient use of the Shenandoah Valley for logistics.</p>
              </div>

              <p className="text-mist-400 text-sm mt-2">
                Abilities have a cooldown (default: 2 turns) after use. Use them wisely!
              </p>
            </div>
          </Section>

          <Section id="victory" title="Victory Conditions" icon={Trophy}>
            <p className="mb-3">The campaign can end in several ways:</p>

            <div className="space-y-3">
              <div className="bg-brass-900 bg-opacity-30 p-3 rounded-lg border border-brass-500">
                <p className="text-brass-400 font-semibold mb-2">1. SP Depletion (Immediate Victory)</p>
                <p>If either side's SP drops to 0 or below, they immediately lose.
                This represents their army's collapse from exhaustion and attrition.</p>
              </div>

              <div className="bg-brass-900 bg-opacity-30 p-3 rounded-lg border border-brass-500">
                <p className="text-brass-400 font-semibold mb-2">2. Total Control (Immediate Victory)</p>
                <p>If one side controls ALL territories on the map, they win immediately.
                Total conquest!</p>
              </div>

              <div className="bg-brass-900 bg-opacity-30 p-3 rounded-lg border border-brass-500">
                <p className="text-brass-400 font-semibold mb-2">3. Campaign End Date (December 1865)</p>
                <p>If the campaign reaches its end date, the side with the most VP wins.
                This represents the political/strategic situation at war's end.</p>
              </div>
            </div>
          </Section>

          <Section id="tips" title="Tips for Regiment Leaders" icon={Clock}>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-brass-400">•</span>
                <span><strong>Manage SP carefully</strong> - Aggressive campaigns can deplete your SP quickly. Balance offense with defense.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brass-400">•</span>
                <span><strong>High-value territories matter</strong> - They give more VP and generate more SP per turn. Prioritize them.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brass-400">•</span>
                <span><strong>Casualties affect SP loss</strong> - Even if you win, taking heavy casualties costs you more SP. Fight smart!</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brass-400">•</span>
                <span><strong>Use abilities at key moments</strong> - Don't waste them on minor battles. Save them for critical campaigns.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brass-400">•</span>
                <span><strong>Export regularly</strong> - Use the Export button to save your campaign progress. Imports let you restore or share campaigns.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brass-400">•</span>
                <span><strong>Edit Map for custom campaigns</strong> - Use the Map Editor to create custom territory layouts and VP values.</span>
              </li>
            </ul>
          </Section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ink-800 bg-ink-900">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-brass-500 hover:bg-brass-500 text-white rounded-lg font-semibold transition"
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpGuide;
