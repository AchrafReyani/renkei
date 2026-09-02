---
"renkei-client": patch
"renkei-next": patch
---

Add a `default` condition next to `import` in the package `exports` so CommonJS-side resolvers that ignore the `import` condition (Jest without ESM mode, some bundler configs) can find `renkei-client`, `renkei-next` and `renkei-next/button` — previously `renkei-next/button` failed with "Cannot find module" under next/jest and needed a `moduleNameMapper` entry.
