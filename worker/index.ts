// Only for a Cloudflare *Worker* project (static assets + this script). A
// Cloudflare *Pages* project uses functions/api/[[path]].ts instead and ignores
// this file. See docs/COMMUNITY-BACKEND-SETUP.md → "If your project is a Worker".
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
