/**
 * secretsService — credentials the user typed into Settings (BYO keys).
 *
 * Handling rules:
 *  • stored in chrome.storage.local under their own key, never mixed with settings
 *  • read ONLY by the background service worker; the UI can ask for a masked
 *    status ("••••3f9a") but can never read a value back
 *  • content scripts cannot reach chrome.storage.local (access level is pinned
 *    to trusted contexts in background/index.ts)
 *  • development builds may additionally carry throwaway keys from `.env`
 */
import type { SecretName, Secrets, SecretsStatus, SecretStatus } from '../types/settings';
import { BUILD_ENV } from '../utils/env';
import { cleanText, maskSecret } from '../utils/sanitize';
import type { KeyValueStore } from './cacheService';

export const SECRETS_KEY = 'rh.secrets';

const NAMES: readonly SecretName[] = ['braveApiKey', 'anthropicApiKey', 'redditClientId'];

/** Keys are opaque tokens: no whitespace, no exotic characters (they go into HTTP headers). */
function validValue(name: SecretName, value: string): boolean {
  return name === 'redditClientId' ? /^[A-Za-z0-9._-]{6,64}$/.test(value) : /^[A-Za-z0-9._-]{8,256}$/.test(value);
}

export class SecretsService {
  private cached: Secrets | undefined;

  constructor(
    private readonly store: KeyValueStore,
    private readonly build: { braveApiKey?: string; anthropicApiKey?: string; redditClientId?: string } = {
      ...BUILD_ENV.devKeys,
      redditClientId: BUILD_ENV.redditClientId,
    },
  ) {}

  private async load(): Promise<Secrets> {
    if (this.cached) return this.cached;
    try {
      const raw = (await this.store.getMany([SECRETS_KEY]))[SECRETS_KEY];
      const out: Secrets = {};
      if (raw && typeof raw === 'object') {
        for (const name of NAMES) {
          const v = (raw as Record<string, unknown>)[name];
          if (typeof v === 'string' && validValue(name, v)) out[name] = v;
        }
      }
      this.cached = out;
    } catch {
      this.cached = {};
    }
    return this.cached;
  }

  /** Background-only. The user's value wins over a build-time value. */
  async get(name: SecretName): Promise<string | undefined> {
    const stored = (await this.load())[name];
    if (stored) return stored;
    const fromBuild = this.build[name];
    return fromBuild ? fromBuild : undefined;
  }

  async status(): Promise<SecretsStatus> {
    const stored = await this.load();
    const result = {} as SecretsStatus;
    for (const name of NAMES) {
      const user = stored[name];
      const build = this.build[name];
      const entry: SecretStatus = user
        ? { configured: true, masked: maskSecret(user), origin: 'user' }
        : build
          ? { configured: true, masked: maskSecret(build), origin: 'build' }
          : { configured: false };
      result[name] = entry;
    }
    return result;
  }

  async set(name: SecretName, value: string): Promise<SecretsStatus> {
    if (!NAMES.includes(name)) throw new Error('Unknown secret');
    const trimmed = cleanText(value, 300);
    if (!validValue(name, trimmed)) throw new Error('That does not look like a valid key');
    const current = { ...(await this.load()), [name]: trimmed };
    this.cached = current;
    await this.store.setMany({ [SECRETS_KEY]: current });
    return this.status();
  }

  async clear(name: SecretName): Promise<SecretsStatus> {
    const current = { ...(await this.load()) };
    delete current[name];
    this.cached = current;
    await this.store.setMany({ [SECRETS_KEY]: current });
    return this.status();
  }

  async clearAll(): Promise<void> {
    this.cached = {};
    await this.store.removeMany([SECRETS_KEY]);
  }

  invalidate(): void {
    this.cached = undefined;
  }
}
