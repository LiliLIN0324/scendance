# assets/library

The scene template's model library. Everything here is **CC0 1.0 Universal**
(public domain dedication, no attribution required) from
[3dassets.dev](https://3dassets.dev). Full provenance, per-model hashes and the
licence objects are in [`ASSET-SOURCES.md`](../../ASSET-SOURCES.md) at the
repository root.

```
assets/library/
  catalogue.json          30 local models: sizes, categories, hashes, source URLs
  online.json            234 online models: metadata only, files are NOT here
  model/<slug>.glb        30 GLB meshes, served from this repository
  thumb/<slug>.webp       30 preview images for the toolbar tiles
```

## `catalogue.json` — the local 30

Read by `model-library.js` at runtime. Shape:

| Field | Meaning |
| --- | --- |
| `models[].slug` | upstream asset slug; also the file name in `model/` and `thumb/` |
| `models[].name` | upstream English title |
| `models[].zh` | Chinese label shown on the tile |
| `models[].bucket` / `category` / `subcategory` | toolbar category rail grouping |
| `models[].query` | English query that retrieves models like this one |
| `models[].sizeMeters` | **`[width, depth, height]` in metres** — real bounding box |
| `models[].bytes` / `triangles` | weight and complexity |
| `models[].glb` / `thumb` | paths relative to the site root |
| `models[].cdnUrl` | upstream CDN URL the file was downloaded from |
| `models[].pageUrl` | upstream asset page, linked from `ASSET-SOURCES.md` |
| `models[].sha256` | hash of the committed GLB, so corruption is detectable |
| `buckets[]` | category rail entries with counts, in display order |

Note the size order: the provider returns `[x, y, z]` = `[width, height, depth]`,
while the renderer wants `[width, depth, height]`. This file is already converted.

## `online.json` — the online 234

Metadata only. **No GLB or preview for an online entry is committed here.**
At runtime the browser fetches each file straight from the provider CDN, which
returns `Access-Control-Allow-Origin: *`:

```
https://cdn.3dassets.dev/assets/<id>/v1/thumb.webp
https://cdn.3dassets.dev/assets/<id>/v1/model.glb
```

So the 30 local models work offline and the 234 online models need a network. If
the CDN is unreachable the local library still works, and the toolbar reports the
failure for that particular drop.

## Editing

**Do not hand-edit these files.** `catalogue.json` is generated and its sha256
values must match the bytes in `model/`. Use the tool:

```sh
python3 tools/catalog/build_catalog.py verify --root .   # check nothing drifted
python3 tools/catalog/build_catalog.py fetch  --root .   # regenerate
```

To replace or add a model, see [`tools/catalog/README.md`](../../tools/catalog/README.md).

## Note on naming

The five files in `../models/` (`table.glb`, `chair.glb`, …) are the **legacy
venue prototype** assets. They are unrelated to this library, are not used by the
scene template, and share no filenames with it. They are kept because the
editable workbench still uses them as a GLB loading sample.
