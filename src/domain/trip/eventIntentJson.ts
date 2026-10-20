export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
function fail(): never {
  throw new Error("INVALID_COMMAND");
}

// JSON.parse loses duplicate members and numeric spelling. Validate before decoding.
export function parseEventJson(source: string, ceiling = 32768): Json {
  if (new TextEncoder().encode(source).byteLength > ceiling) fail();
  let at = 0;
  const space = () => {
    while (/\s/.test(source[at] ?? "") && at < source.length) {
      if (!/[ \t\r\n]/.test(source[at])) fail();
      at++;
    }
  };
  const string = (): string => {
    const start = at++;
    while (at < source.length) {
      const char = source[at++];
      if (char === "\\") at++;
      else if (char === '"') {
        let value: string;
        try {
          value = JSON.parse(source.slice(start, at)) as string;
        } catch {
          return fail();
        }
        if (
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
            value,
          )
        )
          fail();
        if (value.includes("\0")) fail();
        return value;
      }
    }
    return fail();
  };
  const value = (depth: number): Json => {
    if (depth > 32) fail();
    space();
    const c = source[at];
    if (c === '"') return string();
    if (c === "{" || c === "[") {
      at++;
      space();
      const object = Object.create(null) as Record<string, Json>;
      const array: Json[] = [];
      const end = c === "{" ? "}" : "]";
      if (source[at] === end) {
        at++;
        return c === "{" ? object : array;
      }
      while (at < source.length) {
        if (c === "{") {
          if (source[at] !== '"') fail();
          const key = string();
          space();
          if (source[at++] !== ":" || Object.hasOwn(object, key)) fail();
          object[key] = value(depth + 1);
        } else array.push(value(depth + 1));
        space();
        if (source[at] === end) {
          at++;
          return c === "{" ? object : array;
        }
        if (source[at++] !== ",") fail();
        space();
      }
      return fail();
    }
    const token = /^(?:null|true|false|-?(?:0|[1-9][0-9]*))/.exec(source.slice(at))?.[0];
    if (!token || token === "-0") return fail();
    at += token.length;
    const result = JSON.parse(token) as Json;
    if (typeof result === "number" && !Number.isSafeInteger(result)) fail();
    return result;
  };
  const result = value(0);
  space();
  if (at !== source.length) fail();
  return result;
}

export function canonicalEventJson(value: Json): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail();
    return String(value);
  }
  if (typeof value === "string") {
    if (value.includes("\0")) fail();
    if (
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        value,
      )
    )
      fail();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalEventJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      if (!/^[\x20-\x7e]+$/.test(key)) fail();
      return `${JSON.stringify(key)}:${canonicalEventJson(value[key])}`;
    })
    .join(",")}}`;
}
