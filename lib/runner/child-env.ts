// The environment a program under test sees. Not the tool's own: that holds ANTHROPIC_API_KEY,
// and a legacy app that prints its environment (phpinfo(), a debug page, an error log) would put
// the key into its output, which is recorded and may be sent to Claude.

/** What a program needs to start and to read text the same way on both sides. Nothing else passes. */
const PASSED_THROUGH = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "SYSTEMROOT"];

export function childEnv(extra: Record<string, string> = {}, from: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSED_THROUGH) {
    const value = from[name];
    if (value !== undefined) env[name] = value;
  }
  return { ...env, ...extra };
}
