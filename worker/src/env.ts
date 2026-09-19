export interface Env {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  SESSIONS: KVNamespace;
  HUBS: DurableObjectNamespace;
  JWT_SECRET: string;
  REFRESH_SECRET: string;
  APP_NAME: string;
}

export const AUTH_SECRETS = (env: Env) => ({
  jwtSecret: env.JWT_SECRET,
  refreshSecret: env.REFRESH_SECRET,
});