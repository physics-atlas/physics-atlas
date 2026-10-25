import { describe, expect, it } from 'vitest';
import { readSignInProblem, signInProblemText } from './api';

describe('a failed sign-in, as the backend reports it', () => {
  it('reads the reason and GitHub’s code from the address', () => {
    expect(readSignInProblem('?mode=community&signin=denied&detail=access_denied')).toEqual({
      reason: 'denied',
      detail: 'access_denied',
    });
    expect(readSignInProblem('?mode=community&signin=expired')).toEqual({ reason: 'expired' });
  });
  it('ignores anything that isn’t one of its reasons, and keeps the code to a plain word', () => {
    expect(readSignInProblem('?mode=community')).toBeNull();
    expect(readSignInProblem('?signin=<script>')).toBeNull();
    expect(readSignInProblem('?signin=github&detail=<b>bad</b>')?.detail).toBe('bbadb');
  });
  it('says what happened, and passes GitHub’s code on to send to the curators', () => {
    expect(signInProblemText({ reason: 'failed', detail: 'bad_verification_code' })).toContain('“bad_verification_code”');
    expect(signInProblemText({ reason: 'denied' })).toMatch(/cancelled/);
  });
});
