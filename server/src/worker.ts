/** Cloudflare Workers entry point:  `cd server && npx wrangler deploy` */
import { configFromEnv, createHandler } from './handler';

interface Env {
  BRAVE_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  TMDB_API_KEY?: string;
  OMDB_API_KEY?: string;
  NYT_API_KEY?: string;
  GUARDIAN_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  RATE_LIMIT_PER_MINUTE?: string;
}

let handler: ReturnType<typeof createHandler> | undefined;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // One handler per isolate, so the in-memory rate limiter persists between requests.
    handler ??= createHandler(configFromEnv({ ...env }));
    return handler(request);
  },
};
