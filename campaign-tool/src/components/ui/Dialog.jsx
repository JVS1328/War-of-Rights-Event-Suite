import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal } from './Primitives';

/**
 * The paper dialog — one mechanism for every message the tracker used to hand
 * to the browser. `alert`, `confirm` and `prompt` open a chrome-coloured box
 * from another century of the web; these print on the sheet instead, in the
 * same double-ruled modal as everything else.
 *
 * A call site reads the way the old one did:
 *
 *   const { notice, confirm, copyText } = useDialog();
 *   if (!(await confirm({ title: 'Start a new campaign?', danger: true }))) return;
 *   await notice({ title: 'Import failed', body: reason });
 *
 * The provider renders the open dialog *after* its children, so it lays over
 * any other modal on the page without either one knowing about the other.
 * Calls that arrive while a dialog is open queue up and are answered in the
 * order they were made — nothing is dropped.
 */

const DialogContext = createContext(null);

/**
 * Body copy. A message may carry line breaks (a supply warning and what
 * follows from it, say); each becomes its own paragraph rather than a run-on
 * line, and blank lines between them are dropped.
 */
const Paragraphs = ({ text }) => {
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  return lines.map((line, i) => (
    <p key={i} className={i === 0 ? 'text-ink-2' : 'text-ink-2 mt-2'}>
      {line}
    </p>
  ));
};

/** One printed dialog. Mounted fresh per request, so its state starts clean. */
const DialogSheet = ({ request, onSettle }) => {
  const { kind, title, body } = request;
  const textRef = useRef(null);
  const [copied, setCopied] = useState(kind === 'copy' && request.copied === true);

  // Closing without answering: a confirm reads as "no", anything else as done.
  const close = useCallback(
    () => onSettle(kind === 'confirm' ? false : undefined),
    [kind, onSettle]
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(request.text ?? '');
      setCopied(true);
    } catch {
      // The clipboard can be refused outright (insecure context, denied
      // permission). The text is on the sheet and selected, so there is still
      // a way to take it — say nothing and leave the button as it was.
      textRef.current?.select();
    }
  }, [request.text]);

  // A copy sheet hands the text straight over: selected as it opens, so
  // Ctrl+C alone is enough when the clipboard button is no use.
  useEffect(() => {
    if (kind === 'copy') textRef.current?.select();
  }, [kind]);

  // Escape cancels a confirm and closes anything else. Enter works the
  // primary button, which holds the focus — except on a copy sheet, where the
  // text does, so Enter is routed to Copy by hand.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'Enter' && kind === 'copy') {
        e.preventDefault();
        e.stopPropagation();
        copy();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [close, copy, kind]);

  let footer;
  if (kind === 'confirm') {
    footer = (
      <>
        <button onClick={() => onSettle(false)} className="ui-btn flex-1">
          {request.cancelLabel}
        </button>
        <button
          autoFocus
          onClick={() => onSettle(true)}
          className={`ui-btn ${request.danger ? 'ui-btn-danger' : 'ui-btn-primary'} flex-1`}
        >
          {request.confirmLabel}
        </button>
      </>
    );
  } else if (kind === 'copy') {
    footer = (
      <>
        <button onClick={copy} className="ui-btn ui-btn-primary flex-1">
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={close} className="ui-btn flex-1">
          Close
        </button>
      </>
    );
  } else {
    footer = (
      <button autoFocus onClick={close} className="ui-btn ui-btn-primary ml-auto">
        {request.closeLabel}
      </button>
    );
  }

  const text = request.text ?? '';
  // Deep enough to hold what is being handed over — a share link wraps to
  // several lines of its own, a dispatch arrives with them — and capped so
  // the sheet still fits the page.
  const rows = Math.min(
    10,
    Math.max(3, text.split('\n').length, Math.ceil(text.length / 44))
  );

  return (
    <Modal title={title} width="max-w-md" dismissible={false} footer={footer}>
      <Paragraphs text={body} />
      {kind === 'copy' && (
        <textarea
          ref={textRef}
          readOnly
          rows={rows}
          value={text}
          onFocus={(e) => e.target.select()}
          className={`ui-field font-mono text-[13px] ${body ? 'mt-3' : ''}`}
        />
      )}
    </Modal>
  );
};

export const DialogProvider = ({ children }) => {
  const [queue, setQueue] = useState([]);
  const nextId = useRef(0);
  const settledId = useRef(null);

  const ask = useCallback(
    (entry) =>
      new Promise((resolve) => {
        nextId.current += 1;
        setQueue((q) => [...q, { ...entry, id: nextId.current, resolve }]);
      }),
    []
  );

  const api = useMemo(
    () => ({
      notice: ({ title, body, closeLabel = 'Close' } = {}) =>
        ask({ kind: 'notice', title, body, closeLabel }).then(() => undefined),

      confirm: ({
        title,
        body,
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        danger = false,
      } = {}) =>
        ask({ kind: 'confirm', title, body, confirmLabel, cancelLabel, danger }).then(
          (answer) => answer === true
        ),

      copyText: ({ title, body, text, copied = false } = {}) =>
        ask({ kind: 'copy', title, body, text, copied }).then(() => undefined),
    }),
    [ask]
  );

  const current = queue[0] ?? null;

  // Answer the dialog at the head of the queue and let the next one print.
  // The guard keeps a double answer — Escape landing at the same moment as a
  // click — from taking two requests off the queue.
  const settle = useCallback(
    (value) => {
      if (!current || settledId.current === current.id) return;
      settledId.current = current.id;
      current.resolve(value);
      setQueue((q) => q.filter((item) => item.id !== current.id));
    },
    [current]
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && <DialogSheet key={current.id} request={current} onSettle={settle} />}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const api = useContext(DialogContext);
  if (!api) throw new Error('useDialog must be called inside a DialogProvider');
  return api;
};
