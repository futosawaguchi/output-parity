/**
 * JSON with comments (// and /* *\/) and trailing commas, as in the settings files of many tools.
 * Settings are written by people, and a line saying why a value is what it is belongs next to it.
 * Comments and trailing commas are removed outside strings; the rest is read by JSON.parse, so
 * its error messages and positions still apply (positions shift only by what was removed).
 */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripTrailingCommas(stripComments(text)));
}

function stripComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const end = endOfString(text, i);
      out += text.slice(i, end);
      i = end;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      // An unclosed comment is left for JSON.parse to report.
      if (end === -1) return out + text.slice(i);
      // Newlines are kept so that line numbers in errors still match the file.
      out += text.slice(i, end + 2).replace(/[^\n]/g, " ");
      i = end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function stripTrailingCommas(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const end = endOfString(text, i);
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") {
        i++;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/** Index just past the string that starts at `start` (a double quote), or the end of the text. */
function endOfString(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "\\") i += 2;
    else if (text[i] === '"') return i + 1;
    else i++;
  }
  return text.length;
}
