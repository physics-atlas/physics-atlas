// The Cloudflare Worker (wrangler.jsonc): requests for a file in dist/ never
// reach this — Cloudflare serves those as static assets. Everything else
// arrives here: /api/* goes to the community backend, the rest back to the
// assets (which answer 404). See docs/COMMUNITY-BACKEND-SETUP.md.
import { handle } from '../server/api';
import type { Env } from '../server/config';

interface WorkerEnv extends Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    return pathname.startsWith('/api/') ? handle(request, env) : env.ASSETS.fetch(request);
  },
};
