import { env } from "cloudflare:workers";

type RuntimeBindings = Record<string, string | undefined>;

export function runtimeEnv(name: string) {
  const bindings = env as unknown as RuntimeBindings;
  return bindings[name] || process.env[name];
}
