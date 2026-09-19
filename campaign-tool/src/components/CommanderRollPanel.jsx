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
  const waitingOn = rolledSides.length === 1
    ? (rolledSides[0] === 'USA' ? 'Confederate' : 'Union')
    : null;

  return (
    <Section>
      <SectionHead title="Battle Commanders" meta={`Turn ${campaign.currentTurn}`} />
      <SectionBody>
        {!hasRegiments ? (
          <EmptyState
            title="No regiments on the rolls."
            hint="Enter the Union and Confederate regiments under Settings to draw for commanders."
          />
        ) : (
          <>
            <p className="ui-hint mb-2">
              The regiment drawn leaves its side&apos;s pool and stands ready in the recorder.
            </p>

            <CommanderSpinner
              regiments={regiments}
              commanderPool={campaign.commanderPool}
              benchedCommanders={campaign.benchedCommanders}
              selectedCommanders={pending}
              onSelect={onReserveCommander}
            />

            {waitingOn && (
              <p className="ui-hint mt-1.5">Still wanting a commander for the {waitingOn}.</p>
            )}

            {onRecordBattle && rolledSides.length > 0 && (
              <div className="ui-toolbar mt-3 mb-0">
                <button onClick={onRecordBattle} className="ui-btn ui-btn-primary ui-btn-sm">
                  Set up the battle
                </button>
              </div>
            )}
          </>
        )}
      </SectionBody>
    </Section>
  );
};

export default CommanderRollPanel;
