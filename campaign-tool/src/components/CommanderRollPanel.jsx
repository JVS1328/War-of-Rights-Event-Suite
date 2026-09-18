import { Swords } from 'lucide-react';
import CommanderSpinner from './CommanderSpinner';
import { Section, SectionHead, SectionBody, EmptyState } from './ui/Primitives';

/**
 * CommanderRollPanel - Campaign-map side panel for rolling the commanders
 * who will lead the next battle.
 *
 * Rolling here reserves the regiment: it comes out of that side's commander
 * pool immediately and is pre-selected when the Battle Recorder is opened.
 * Standard campaigns only — Grand Campaign draws its commanders from tokens.
 */
const CommanderRollPanel = ({ campaign, onReserveCommander, onRecordBattle }) => {
  if (!campaign) return null;

  const regiments = campaign.regiments || { USA: [], CSA: [] };
  const pending = campaign.pendingCommanders || { USA: null, CSA: null };
  const hasRegiments = (regiments.USA?.length || 0) > 0 || (regiments.CSA?.length || 0) > 0;
  const rolledSides = ['USA', 'CSA'].filter(side => pending[side]);

  return (
    <Section>
      <SectionHead title="Battle Commanders" meta={`Turn ${campaign.currentTurn}`} />
      <SectionBody>
        {!hasRegiments ? (
          <EmptyState title="No regiments configured"
            hint="Add USA and CSA regiments in Settings to roll for commanders."
          />
        ) : (
          <>
            <p className="ui-hint mb-3">
              Roll who leads the next battle. The winner leaves that side's pool and is
              pre-selected in the Battle Recorder.
            </p>

            <CommanderSpinner
              regiments={regiments}
              commanderPool={campaign.commanderPool}
              benchedCommanders={campaign.benchedCommanders}
              selectedCommanders={pending}
              onSelect={onReserveCommander}
            />

            <div className="mt-3 space-y-2">
              {rolledSides.length === 0 ? (
                <div className="text-xs text-mist-500">Nobody rolled yet.</div>
              ) : (
                <div className="text-xs text-mist-400">
                  {rolledSides.map(side => (
                    <span key={side} className="mr-2">
                      <span className={side === 'USA' ? 'text-union-400' : 'text-rebel-400'}>{side}</span>
                      <span className="text-mist-300"> {pending[side].name}</span>
                    </span>
                  ))}
                  {rolledSides.length === 1 && (
                    <span className="text-mist-500">— still need the other side</span>
                  )}
                </div>
              )}

              {onRecordBattle && rolledSides.length > 0 && (
                <button onClick={onRecordBattle} className="ui-btn ui-btn-primary ui-btn-block">
                  <Swords className="w-4 h-4" />
                  Set Up Battle
                </button>
              )}
            </div>
          </>
        )}
      </SectionBody>
    </Section>
  );
};

export default CommanderRollPanel;
