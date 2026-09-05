// renkei.yaml reader/writer for the CLI. Edits go through the `yaml` package's
// Document API so comments, key order and quoting style survive a round trip —
// the file is meant to be committed and reviewed, not regenerated.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, isScalar, parseDocument, visit, YAMLSeq } from 'yaml';

/** Same names, same order, as `renkei-server/config-file`. */
export const CONFIG_FILE_NAMES = ['renkei.yaml', 'renkei.yml'];

/**
 * Which file the CLI should write to: the renkei.yaml in `cwd` if there is one,
 * otherwise `.env`. One command, one target — never both.
 * @param {string} cwd
 * @returns {{ kind: 'yaml' | 'env', path: string }}
 */
export function configTarget(cwd) {
  for (const name of CONFIG_FILE_NAMES) {
    const path = resolve(cwd, name);
    if (existsSync(path)) return { kind: 'yaml', path };
  }
  return { kind: 'env', path: resolve(cwd, '.env') };
}

/** @param {string} path */
export function readDocument(path) {
  const doc = parseDocument(readFileSync(path, 'utf8'));
  if (doc.errors.length) {
    throw new Error(`${path} is not valid YAML — ${doc.errors[0].message}`);
  }
  return doc;
}

/** @param {string} path @param {import('yaml').Document} doc */
export function writeDocument(path, doc) {
  writeFileSync(path, doc.toString({ lineWidth: 0, singleQuote: false }));
}

/**
 * Append to (or replace an entry of) a top-level sequence, creating it when the
 * key is absent. `matches` identifies the entry to replace.
 * @param {import('yaml').Document} doc
 * @param {string} key
 * @param {Record<string, unknown>} entry
 * @param {(item: any) => boolean} matches
 * @param {boolean} replace
 * @returns {'added' | 'replaced' | 'exists'}
 */
export function upsertInSequence(doc, key, entry, matches, replace) {
  let seq = doc.get(key);
  if (!(seq instanceof YAMLSeq)) {
    seq = new YAMLSeq();
    doc.set(key, seq);
  }
  // A `clients: []` written flow-style stays flow-style otherwise, and one
  // long line is the opposite of what a reviewable config file is for.
  seq.flow = false;
  const node = newEntry(doc, entry);
  const at = seq.items.findIndex((item) => matches(itemToJs(doc, item)));
  if (at >= 0) {
    if (!replace) return 'exists';
    seq.items[at] = node;
    return 'replaced';
  }
  seq.items.push(node);
  return 'added';
}

/**
 * A node for `entry`, with every `${VAR}` reference double-quoted. Unquoted it
 * is legal YAML, but the quotes match what `renkei init` writes and keep the
 * value safe if a reference ever starts a line with a flow indicator.
 * @param {import('yaml').Document} doc @param {Record<string, unknown>} entry
 */
function newEntry(doc, entry) {
  const node = doc.createNode(entry);
  quoteReferenceScalars(node);
  return node;
}

/** @param {unknown} node */
function quoteReferenceScalars(node) {
  visit(node, {
    Scalar(_key, scalar) {
      if (isScalar(scalar) && typeof scalar.value === 'string' && scalar.value.includes('${')) {
        scalar.type = 'QUOTE_DOUBLE';
      }
    },
  });
}

/**
 * A whole object as YAML text, with the same quoting rule: `${VAR}` references
 * double-quoted, everything else in the plainest form that round-trips.
 * @param {unknown} value
 */
export function quoteReferences(value) {
  const doc = new Document(value);
  quoteReferenceScalars(doc.contents);
  return doc.toString({ lineWidth: 0 });
}

/** @param {import('yaml').Document} doc @param {unknown} item */
function itemToJs(doc, item) {
  return item && typeof item === 'object' && 'toJSON' in item
    ? /** @type {any} */ (item).toJSON(null, { doc })
    : item;
}

/**
 * `LINE_TW_CHANNEL_SECRET` — the environment variable a channel's secret is
 * referenced by, derived from its region so the name says which channel it
 * belongs to (the flat `LINE_LOGIN_CHANNEL_SECRET` namespace is what
 * renkei.yaml exists to get away from).
 * @param {string} region @param {boolean} isMiniApp @param {string} channelId
 */
export function secretVarName(region, isMiniApp, channelId) {
  const slug = (isMiniApp ? `miniapp_${channelId}` : region)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_');
  return `LINE_${slug}_CHANNEL_SECRET`;
}

/** `RENKEI_APP_CLIENT_SECRET` for client `app`. @param {string} clientId */
export function clientSecretVarName(clientId) {
  return `RENKEI_${clientId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_CLIENT_SECRET`;
}
