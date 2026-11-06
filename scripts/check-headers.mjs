#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

function parseWorkersHeaders(text) {
  const headers = new Map()

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue

    // scope 行（如 /*）不以空白开头
    if (!raw.startsWith(' ') && !raw.startsWith('\t')) continue

    const separator = line.indexOf(':')
    if (separator === -1) continue

    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim())
  }

  return headers
}

function parseNginxHeaders(text) {
  const headers = new Map()
  const pattern = /add_header\s+([A-Za-z0-9-]+)\s+"([^"]*)"\s+always;/g

  for (const match of text.matchAll(pattern)) {
    headers.set(match[1].toLowerCase(), match[2])
  }

  return headers
}

const workers = parseWorkersHeaders(read('site/public/_headers'))
const nginx = parseNginxHeaders(read('build/nginx.conf'))

const failures = []

for (const [name, value] of workers) {
  const nginxValue = nginx.get(name)
  if (nginxValue === undefined) {
    failures.push(`missing in build/nginx.conf: ${name}`)
  } else if (nginxValue !== value) {
    failures.push(`value mismatch for ${name}: _headers="${value}" nginx="${nginxValue}"`)
  }
}

for (const name of nginx.keys()) {
  if (!workers.has(name)) failures.push(`missing in site/public/_headers: ${name}`)
}

if (failures.length > 0) {
  console.error('[headers] configuration drift detected:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log(`[headers] ${workers.size} header(s) consistent between _headers and nginx.conf`)
}
