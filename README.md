# Sylva

A procedural greenhouse. Every plant grows deterministically from a compact
seed code: a 24-gene genome serialized with a version byte and checksum.
Share a code, share the plant.

## Features

- Four archetypes: fern, flowering herb, grass tuft, sapling
- Real-time growth animation with wind physics on a Canvas 2D stage
- Mutate a specimen or cross-pollinate two pressed specimens to breed hybrids
- Persistent greenhouse collection (localStorage, 48 specimens)
- Procedural Latin binomial names and stable accession numbers
- Four environments (dawn, noon, dusk, night) with pollen and fireflies
- Shareable seed codes and `?seed=` URLs
- Keyboard shortcuts: N sow, R regrow, M mutate, S press, G greenhouse

## Running

Static site, zero dependencies, zero build step. Serve the folder with any
static server:

    python3 -m http.server

## Tests

    node test/run.mjs

Covers seed-code round-trips, checksum corruption rejection, breeding and
mutation validity, and segment-count bounds across all archetypes.

## Structure

    index.html      shell and layout
    styles.css      herbarium-plate interface
    js/rng.js       deterministic PRNG (xmur3 + mulberry32)
    js/genome.js    24-gene genome, seed codes, breeding, naming
    js/plant.js     archetype builders and shared geometry traversal
    js/render.js    stage, environments, wind, thumbnails
    js/ui.js        specimen panel, toasts, greenhouse overlay
    js/main.js      wiring and boot
