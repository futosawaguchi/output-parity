// Values that look like passwords, keys or tokens are replaced with *** before anything is sent to
// Claude (DESIGN 7-4e ③). Business data (names, amounts) is not touched: judging needs it, and
// hiding an amount would hide 57,000 ≠ 72,000. This is a net under the other measures (what is
// sent is chosen in the settings; keys are never read), not a guarantee: a password with no name
// next to it and no known shape gets through.

export type Redaction = {
  text: string;
  /** How many values were replaced. */
  count: number;
  /** What kinds were found, for the record (never the values). */
  kinds: string[];
};

const MASK = "***";

/** Names that say the value next to them is a secret. Matched anywhere in a longer name (DB_PASSWORD, apiKey). */
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]*(?:password|passwd|passphrase|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential|パスワード|暗証番号)[A-Za-z0-9_.-]*`;

type Rule = { kind: string; pattern: RegExp; replace: (match: string, ...groups: string[]) => string };

const RULES: Rule[] = [
  {
    kind: "秘密鍵",
    pattern: /-----BEGIN ([A-Z ]*)PRIVATE KEY-----[\s\S]*?-----END \1PRIVATE KEY-----/g,
    replace: (_m, type) => `-----BEGIN ${type}PRIVATE KEY-----${MASK}-----END ${type}PRIVATE KEY-----`,
  },
  // Shapes that are secrets whatever they are called.
  { kind: "API キー", pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replace: () => MASK },
  { kind: "API キー", pattern: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g, replace: () => MASK },
  { kind: "AWS のアクセスキー", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: () => MASK },
  { kind: "GitHub のトークン", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g, replace: () => MASK },
  { kind: "Slack のトークン", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, replace: () => MASK },
  { kind: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: () => MASK },
  // user:password@host in a URL (a database connection string, for example).
  {
    kind: "URL の中のパスワード",
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]+)@/gi,
    replace: (_m, before) => `${before}${MASK}@`,
  },
  // define('DB_PASSWORD', 'value')
  {
    kind: "名前つきの秘密の値",
    pattern: new RegExp(String.raw`(define\(\s*["']${SECRET_NAME}["']\s*,\s*)(["'])([^"'\n]+)\2`, "gi"),
    replace: (_m, before, quote) => `${before}${quote}${MASK}${quote}`,
  },
  // $password = "value";  'password' => 'value'  "token": "value"  password: 'value'
  {
    kind: "名前つきの秘密の値",
    pattern: new RegExp(String.raw`(${SECRET_NAME}["']?\s*(?:=>|:|=)\s*)(["'])([^"'\n]+)\2`, "gi"),
    replace: (_m, before, quote) => `${before}${quote}${MASK}${quote}`,
  },
  // DB_PASSWORD=value (an .env-style line) and Password: value (a line of a document)
  {
    kind: "名前つきの秘密の値",
    pattern: new RegExp(String.raw`^(\s*(?:export\s+)?${SECRET_NAME}\s*(?:=|:|：)\s*)([^\s"'#][^\s#]*)`, "gim"),
    replace: (_m, before) => `${before}${MASK}`,
  },
];

export function redactSecrets(text: string): Redaction {
  let count = 0;
  const kinds = new Set<string>();
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (match: string, ...groups: string[]) => {
      const replaced = rule.replace(match, ...groups);
      if (replaced === match) return match;
      count++;
      kinds.add(rule.kind);
      return replaced;
    });
  }
  return { text: out, count, kinds: [...kinds] };
}
