import { useState, useEffect } from 'react';
import SeasonTracker from './SeasonTracker';
import SharedStatsView from './components/stats/SharedStatsView';
import { PublicApp } from './public/PublicApp';
import { AdminGate } from './admin/AdminGate';
import { isStatsBundle } from './stats/statsBundle';
import { getShareFromUrl, fetchSharePayload } from './utils/shareSeason';
import { parseRoute, hrefFor } from './cloud/route';

/** The page you land on when a link points at something that isn't there. */
function NotFound({ title, detail }) {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        <p className="text-gray-400 mb-4">{detail}</p>
        <a href={hrefFor({ kind: 'directory' })} className="text-teal-400 hover:text-teal-300">
          Find your event
        </a>
      </div>
    </div>
  );
}

/**
 * Two sites, one build.
 *
 * The public one is what the URL gives you by default: find your event, read
 * its season and its player stats, or use the balancer without an event at
 * all. The admin one is behind #/admin and the owner's token — that is the
 * tracker, where events are edited and rounds imported.
 *
 * Share links predate both and still work: a #s= or #share= hash is handled
 * first and never reaches the router.
 */
function App() {
  const [shareData, setShareData] = useState(undefined); // undefined = not checked yet
  const [shareError, setShareError] = useState(false);
  const [route, setRoute] = useState(() => parseRoute());

  useEffect(() => {
    const loadShare = async () => {
      setShareError(false);
      setRoute(parseRoute());
      const result = getShareFromUrl();

      if (result?.pending) {
        const data = await fetchSharePayload(result.id);
        if (data) {
          setShareData(data);
        } else {
          setShareError(true);
          setShareData(null);
        }
      } else {
        setShareData(result);
      }
    };

    loadShare();

    const onHashChange = () => loadShare();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Still checking
  if (shareData === undefined) return null;

  // Short link failed to load
  if (shareError) {
    return (
      <NotFound
        title="Share Link Not Found"
        detail="This share link may have expired or is invalid."
      />
    );
  }

  // Player-stats-only share → dedicated read-only view (no tracker chrome,
  // no local writes), mirroring the campaign tracker's shared map page.
  if (shareData?.kind === 'stats') {
    if (isStatsBundle(shareData.bundle)) {
      return <SharedStatsView bundle={shareData.bundle} eventName={shareData.name} />;
    }
    return (
      <NotFound
        title="Share Link Not Found"
        detail="This share link may have expired or is invalid."
      />
    );
  }

  // A season/event share link opens the tracker with the import prompt, which
  // is an owner's job — so it goes through the same gate the admin site does.
  if (shareData) {
    return (
      <AdminGate>
        <SeasonTracker initialShareData={shareData} />
      </AdminGate>
    );
  }

  if (route.kind === 'admin') {
    return (
      <AdminGate>
        <SeasonTracker pullSlug={route.pull} />
      </AdminGate>
    );
  }

  return <PublicApp route={route} />;
}

export default App;
