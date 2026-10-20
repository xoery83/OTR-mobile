# Frozen pure matching dependency

Owner-approved source9555ed42197bb0c955f12146317d2889757a7fd8. Original10 TypeScript files and bundled data remain byte-exact; FROZEN_SOURCE.json pins all hashes. This directory is a vendored pure matching package, not UI code. Lexical evidence, errors and explanation text are internal matching metadata and are not rendered as Native UI copy. Native copy uses src/ui/catalogs.ts; asset titles/authors/credits retain original source data.

Metro does not resolve the package's explicit .js imports to .ts. Adjacent JS is build-time type erasure with the application's installed TypeScript6.0.3, targetES2020/moduleESNext; original TypeScript/imports/algorithm are untouched. No compiler, Node I/O or Web tooling enters the App graph. The frozen runtime hash/type-erasure regression checks reproduce each file:

```js
import ts from 'typescript';
const result = ts.transpileModule(originalSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  fileName: originalName,
});
// Save result.outputText to originalName.replace(/\.ts$/, '.js').
```

Run `npx vitest run --configLoader runner src/features/trip-cover/coverDecision.test.ts` from the candidate root. Build with the existing Expo CLI `export --platform ios --max-workers 2 --dump-assetmap --output-dir <isolated output>`, offline and a private TMPDIR. No device or Metro8083 mutation is required.

Source photograph licence links, individual credits and generated-tool provenance are in catalog.json/allowlist.json and accessible through Native Gallery Sources and credits. GeoNames CC BY4.0/Wikidata CC0 attribution is also shown there. Pending rights, human and crop states are retained. Explicit pending-landmark-preview consumer policy is only for this Owner-authorized isolated preview candidate; it is not production rights approval.
