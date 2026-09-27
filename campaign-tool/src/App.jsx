import { useState, useEffect } from 'react';
import CampaignTracker from './CampaignTracker';
import SharedMapView from './components/SharedMapView';
import { getShareFromUrl, fetchSharePayload, decodeSharePayload } from './utils/shareMap';

// How often an open live link asks for the board again.
const LIVE_POLL_MS = 10000;

function App() {
  const [shareData, setShareData] = useState(undefined); // undefined = not checked yet
  const [shareError, setShareError] = useState(false);

  useEffect(() => {
    // Each load bumps this, so a fetch that lands after the hash has moved on
    // is thrown away rather than printed over the newer link.
    let seq = 0;
    let liveId = null;
    let lastRaw = null;
    let timer = null;

    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    // A live link: take the board again, and print it only if it moved.
    const refresh = async () => {
      const mine = seq;
      const id = liveId;
      if (!id) return;
      const res = await fetchSharePayload(id);
      if (mine !== seq || !res || res.payload === lastRaw) return;
      const data = decodeSharePayload(res.payload);
      if (!data) return;
      lastRaw = res.payload;
      setShareData({ ...data, live: res.live });
    };

    const loadShare = async () => {
      const mine = ++seq;
      stopPolling();
      liveId = null;
      lastRaw = null;
      setShareError(false);
      const result = getShareFromUrl();

      if (!result?.pending) {
        setShareData(result);
        return;
      }

      const res = await fetchSharePayload(result.id);
      if (mine !== seq) return;
      const data = res && decodeSharePayload(res.payload);
      if (!data) {
        setShareError(true);
        setShareData(null);
        return;
      }
      lastRaw = res.payload;
      setShareData({ ...data, live: res.live });
      if (res.live) {
        liveId = result.id;
        timer = setInterval(() => {
          if (document.visibilityState === 'visible') refresh();
        }, LIVE_POLL_MS);
      }
    };

    loadShare();

    const onHashChange = () => loadShare();
    // Back on a tab that sat in the background: catch up at once.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      seq++;
      stopPolling();
      window.removeEventListener('hashchange', onHashChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Still checking
  if (shareData === undefined) return null;

  // Short link failed to load
  if (shareError) {
    return (
      <div className="app-shell grid place-items-center p-6">
        {/* A notice pinned to the sheet, not a card: rules above and below,
            the apology in ink, one way out. */}
        <div className="relative z-10 max-w-sm w-full text-center">
          <div className="overline">The Campaign Dispatch</div>
          <h2 className="font-display text-2xl font-black uppercase tracking-wide border-y border-rule py-3 mb-3">
            No such dispatch
          </h2>
          <p className="ui-hint mb-5">
            This share link has expired, or was never issued.
          </p>
          <a href={window.location.pathname} className="ui-btn ui-btn-primary">
            Open the tracker
          </a>
        </div>
      </div>
    );
  }

  // Shared view
  if (shareData) return <SharedMapView shareData={shareData} />;

  // Normal tracker
  return <CampaignTracker />;
}

export default App;
