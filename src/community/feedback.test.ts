import { describe, expect, it } from 'vitest';
import { MESSAGE_MAX, feedbackIssue, feedbackProblems, quietMentions } from './feedback';

const sample = { kind: 'bug' as const, title: 'Sample title', message: 'Sample message.' };

describe('feedbackProblems', () => {
  it('accepts complete feedback, with or without a page on the site', () => {
    expect(feedbackProblems(sample)).toEqual([]);
    expect(feedbackProblems({ ...sample, page: '/?mode=page&concept=sample' })).toEqual([]);
  });
  it('says what is missing or too long, field by field', () => {
    expect(feedbackProblems({}).map((p) => p.field)).toEqual(['kind', 'title', 'message']);
    expect(feedbackProblems({ ...sample, kind: 'praise' }).map((p) => p.field)).toEqual(['kind']);
    expect(feedbackProblems({ ...sample, title: '   ' }).map((p) => p.field)).toEqual(['title']);
    expect(feedbackProblems({ ...sample, message: 'x'.repeat(MESSAGE_MAX + 1) }).map((p) => p.field)).toEqual(['message']);
  });
  it('only takes a page on this site', () => {
    for (const page of ['https://elsewhere.example/', '//elsewhere.example/', 'mode=page', 7])
      expect(feedbackProblems({ ...sample, page }).map((p) => p.field)).toEqual(['page']);
  });
});

describe('feedbackIssue', () => {
  it('labels the issue, says who sent it and about what, and quotes the words as written', () => {
    const issue = feedbackIssue({ ...sample, kind: 'accessibility', page: '/?mode=concepts' }, 'ada');
    expect(issue.title).toBe('Sample title');
    expect(issue.labels).toEqual(['feedback', 'feedback: accessibility']);
    expect(issue.body).toContain('**About:** Accessibility');
    expect(issue.body).toContain('**Page:** `/?mode=concepts`');
    expect(issue.body).toContain('@ada');
    expect(issue.body.endsWith('Sample message.')).toBe(true);
  });
  it("doesn't let the words ping other GitHub accounts", () => {
    expect(quietMentions('cc @someone and me@example.org, @')).toBe('cc @​someone and me@​example.org, @');
    const issue = feedbackIssue({ ...sample, title: 'Hi @team', message: 'Ping @everyone' }, 'ada');
    expect(issue.title).not.toMatch(/@team/);
    expect(issue.body).not.toMatch(/@everyone/);
  });
});
