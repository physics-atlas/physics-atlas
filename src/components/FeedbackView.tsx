import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchMe, loginHref, signInProblemOnLoad, signInProblemText, submitFeedback } from '../community/api';
import type { FeedbackResult, Me } from '../community/api';
import { FEEDBACK_KINDS, MESSAGE_MAX, TITLE_MAX, feedbackProblems } from '../community/feedback';
import type { FeedbackField, FeedbackKind } from '../community/feedback';

// Feedback on the site from anyone signed in with GitHub. It goes to the
// atlas repository as a public issue (Decision 38), so the writer can follow
// the replies there; the form says so before anything is sent.

/** Where to report when the backend isn't there (local development, or before it's set up). */
const ISSUES_FALLBACK = 'https://github.com/physics-atlas/physics-atlas/issues';

export default function FeedbackView({ from }: { from: string | null }) {
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [withPage, setWithPage] = useState(Boolean(from));
  const [shownProblems, setShownProblems] = useState<{ field: FeedbackField; message: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void fetchMe().then((m) => live && setMe(m));
    return () => {
      live = false;
    };
  }, []);
  // After sending, the answer takes focus: the form is gone, or what went wrong is there.
  useEffect(() => {
    if (result?.ok) doneRef.current?.focus();
    else if (result) summaryRef.current?.focus();
  }, [result]);

  const page = withPage && from ? from : undefined;
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const problems = feedbackProblems({ kind: kind ?? undefined, title, message, page });
    setShownProblems(problems);
    setResult(null);
    if (problems.length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSending(true);
    setResult(await submitFeedback({ kind: kind!, title: title.trim(), message: message.trim(), ...(page ? { page } : {}) }));
    setSending(false);
  };
  const problemOf = (f: FeedbackField) => shownProblems.find((p) => p.field === f);
  const invalid = (f: FeedbackField) => (problemOf(f) ? { 'aria-invalid': true as const } : {});
  const describedBy = (f: FeedbackField, hint?: string) =>
    [hint, problemOf(f) ? id(`${f}-problem`) : undefined].filter(Boolean).join(' ') || undefined;
  const fieldProblem = (f: FeedbackField) =>
    problemOf(f) && (
      <p className="feedback-problem" id={id(`${f}-problem`)}>
        {problemOf(f)!.message}
      </p>
    );
  const here = `${window.location.pathname}?mode=feedback`;

  return (
    <div className="feedback-view">
      <div className="feedback-panel">
        <h1 id={id('title')}>Feedback</h1>
        <p>
          Tell us what works, what doesn't, and what you'd like the atlas to have. It goes to the people who build
          Physics Atlas as a <strong>public issue on GitHub</strong>, under your GitHub name — so you can follow the
          replies there.
        </p>

        {me === undefined && (
          <p className="feedback-note" role="status">
            Checking whether you're signed in…
          </p>
        )}

        {me !== undefined && (me === null || !me.configured) && (
          <p className="feedback-note">
            Feedback here needs the site's backend, which isn't running on this copy of the site. You can open an issue
            on <a href={ISSUES_FALLBACK}>the atlas's GitHub page</a> instead.
          </p>
        )}

        {me?.configured && !me.user && (
          <>
            {signInProblemOnLoad && (
              <p className="feedback-problem" role="alert">
                <strong>Not signed in.</strong> {signInProblemText(signInProblemOnLoad)}
              </p>
            )}
            <p>Sign in with GitHub to send feedback — signing in is what keeps the form free of spam.</p>
            <p>
              <a className="draft-button draft-button-primary" href={loginHref(here)}>
                Sign in with GitHub
              </a>
            </p>
          </>
        )}

        {me?.configured && me.user && result?.ok && (
          <div className="feedback-done" ref={doneRef} tabIndex={-1} role="status">
            <h2>Thank you!</h2>
            <p>
              Your feedback is <a href={result.url}>issue #{result.number}</a> on GitHub. Replies there reach you through
              GitHub's notifications.
            </p>
            <p>
              <button
                type="button"
                className="draft-button"
                onClick={() => {
                  setResult(null);
                  setTitle('');
                  setMessage('');
                  setKind(null);
                }}
              >
                Send more feedback
              </button>
            </p>
          </div>
        )}

        {me?.configured && me.user && !result?.ok && (
          <form className="feedback-form" onSubmit={send} noValidate aria-labelledby={id('title')}>
            <p className="feedback-signed-in">
              Signed in as <strong>@{me.user.login}</strong>
            </p>

            {(shownProblems.length > 0 || (result && !result.ok)) && (
              <div className="feedback-summary" ref={summaryRef} tabIndex={-1} role="alert">
                {shownProblems.length > 0 ? (
                  <>
                    <p>
                      <strong>Before sending:</strong>
                    </p>
                    <ul>
                      {shownProblems.map((p) => (
                        <li key={p.field}>
                          <a href={`#${id(p.field)}`}>{p.message}</a>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  result &&
                  !result.ok && (
                    <>
                      <p>
                        <strong>It wasn't sent.</strong> {result.error}
                      </p>
                      {result.problems && (
                        <ul>
                          {result.problems.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )
                )}
              </div>
            )}

            <fieldset className="feedback-kinds" aria-describedby={describedBy('kind')}>
              <legend className="draft-label">What is it about?</legend>
              {(Object.keys(FEEDBACK_KINDS) as FeedbackKind[]).map((k, i) => (
                <label key={k} className="draft-check">
                  <input
                    type="radio"
                    name={id('kind')}
                    id={i === 0 ? id('kind') : undefined}
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    {...invalid('kind')}
                  />
                  {FEEDBACK_KINDS[k].label}
                </label>
              ))}
              {fieldProblem('kind')}
            </fieldset>

            <div className="draft-field">
              <label className="draft-label" htmlFor={id('title')}>
                Title
              </label>
              <input
                id={id('title')}
                className="draft-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-describedby={describedBy('title', id('title-hint'))}
                {...invalid('title')}
                required
              />
              <p className="draft-hint" id={id('title-hint')}>
                A few words, e.g. “The legend covers the map on my phone”. Up to {TITLE_MAX} characters.
              </p>
              {fieldProblem('title')}
            </div>

            <div className="draft-field">
              <label className="draft-label" htmlFor={id('message')}>
                Your feedback
              </label>
              <textarea
                id={id('message')}
                className="draft-input draft-textarea"
                rows={8}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-describedby={describedBy('message', id('message-hint'))}
                {...invalid('message')}
                required
              />
              <p className="draft-hint" id={id('message-hint')}>
                What happened, or what you'd like — and for a problem, what you were doing and on what device. Markdown
                works. {message.length > MESSAGE_MAX * 0.8 && `${message.length} of ${MESSAGE_MAX} characters.`}
              </p>
              {fieldProblem('message')}
            </div>

            {from && (
              <div className="draft-field">
                <label className="draft-check">
                  <input type="checkbox" checked={withPage} onChange={(e) => setWithPage(e.target.checked)} />
                  Say which page it's about: <code>{from}</code>
                </label>
              </div>
            )}

            <p className="feedback-note">
              Everyone can read issues on GitHub: please leave out anything private, such as an email address. For a
              security problem, use GitHub's private vulnerability reporting instead.
            </p>
            <p>
              <button type="submit" className="draft-button draft-button-primary" disabled={sending}>
                {sending ? 'Sending…' : 'Send feedback'}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
