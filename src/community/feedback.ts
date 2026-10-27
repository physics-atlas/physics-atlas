// Feedback on the site, from anyone signed in with GitHub: it becomes an
// issue in the atlas repository, opened by the backend's GitHub App
// (server/api.ts, POST /api/feedback) and labelled "feedback". Shared by the
// form (components/FeedbackView.tsx) and the server, so both check it the same
// way. Pure: no fetch, no DOM.

export const FEEDBACK_KINDS = {
  bug: { label: "Something doesn't work", issueLabel: 'feedback: bug' },
  idea: { label: 'An idea for the site', issueLabel: 'feedback: idea' },
  content: { label: 'The physics on the map or the pages', issueLabel: 'feedback: content' },
  accessibility: { label: 'Accessibility', issueLabel: 'feedback: accessibility' },
  other: { label: 'Something else', issueLabel: 'feedback: other' },
} as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;

export const FEEDBACK_LABEL = 'feedback';
export const TITLE_MAX = 120;
export const MESSAGE_MAX = 5000;
const PAGE_MAX = 300;

export interface Feedback {
  kind: FeedbackKind;
  title: string;
  message: string;
  /** Where on the site it's about: a path and query on this site, if the writer chose to include it */
  page?: string;
}

export type FeedbackField = 'kind' | 'title' | 'message' | 'page';

/** What's wrong with it, field by field (empty: it can be sent). */
export function feedbackProblems(f: Partial<Record<keyof Feedback, unknown>>): { field: FeedbackField; message: string }[] {
  const out: { field: FeedbackField; message: string }[] = [];
  if (typeof f.kind !== 'string' || !(f.kind in FEEDBACK_KINDS)) out.push({ field: 'kind', message: 'Choose what it is about.' });
  const title = typeof f.title === 'string' ? f.title.trim() : '';
  if (!title) out.push({ field: 'title', message: 'Give it a short title.' });
  else if (title.length > TITLE_MAX) out.push({ field: 'title', message: `Keep the title under ${TITLE_MAX} characters.` });
  const message = typeof f.message === 'string' ? f.message.trim() : '';
  if (!message) out.push({ field: 'message', message: 'Write what you would like to tell us.' });
  else if (message.length > MESSAGE_MAX)
    out.push({ field: 'message', message: `Keep it under ${MESSAGE_MAX} characters — or split it into two.` });
  if (f.page !== undefined && (typeof f.page !== 'string' || !f.page.startsWith('/') || f.page.startsWith('//') || f.page.length > PAGE_MAX))
    out.push({ field: 'page', message: 'The page it is about has to be one on this site.' });
  return out;
}

/**
 * Someone's words in an issue: as they wrote them, except that an @name
 * doesn't notify that GitHub account (a zero-width space after the @) — the
 * form can't be a way to ping strangers.
 */
export const quietMentions = (text: string) => text.replace(/@(?=[A-Za-z0-9])/g, '@​');

/** The issue GitHub gets: the writer's own title, and a body that says who sent it, about what. */
export function feedbackIssue(f: Feedback, login: string): { title: string; body: string; labels: string[] } {
  const kind = FEEDBACK_KINDS[f.kind];
  const lines = [
    `**About:** ${kind.label}`,
    ...(f.page ? [`**Page:** \`${f.page.replace(/`/g, '')}\``] : []),
    // The writer is mentioned on purpose, so they follow the replies.
    `**From:** @${login}, through the Physics Atlas feedback page`,
    '',
    '---',
    '',
    quietMentions(f.message.trim()),
  ];
  return { title: quietMentions(f.title.trim()), body: lines.join('\n'), labels: [FEEDBACK_LABEL, kind.issueLabel] };
}
