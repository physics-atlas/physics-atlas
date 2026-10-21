// Cloudflare Pages Function: every /api/* request goes to the community backend
// (server/api.ts). The settings are the project's environment variables and
// secrets — see docs/COMMUNITY-BACKEND-SETUP.md.
import { handle } from '../../server/api';
import type { Env } from '../../server/config';

export const onRequest = (context: { request: Request; env: Env }): Promise<Response> =>
  handle(context.request, context.env);
