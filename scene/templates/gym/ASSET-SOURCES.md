# 3D asset sources

Retrieved from the official 3DAssets.dev REST API on 2026-10-02. All GLB files are cached locally and are served from this project; runtime network access to the provider is unnecessary. Original files are unchanged.

The provider identifies these as AI-generated 3D models and licenses them under **CC0 1.0 Universal**. The API reports `attributionRequired: false`; no additional attribution text was returned. Source URLs and complete returned licence objects are retained in `assets/catalogue.json`.

| Role | Original asset | Local file | Bytes | Triangles | Size, X × Y × Z (m) |
| --- | --- | --- | ---: | ---: | --- |
| table | [Conference table module (Hotel and Resort Operations)](https://3dassets.dev/assets/hotel-and-resort-operations-conference-table-module-a6abb373) | `assets/models/table.glb` | 75548 | 1476 | 1.600 × 0.742 × 0.900 |
| chair | [Canteen stacking chair (Office Lobby and Building Facilities)](https://3dassets.dev/assets/office-lobby-and-facilities-canteen-stacking-chair-3440c7d8) | `assets/models/chair.glb` | 51616 | 1022 | 0.460 × 0.887 × 0.514 |
| laptop | [Convertible flip laptop (Computers and Desk Gadgets)](https://3dassets.dev/assets/computers-and-desk-gadgets-laptop-convertible-flip-068fe56f) | `assets/models/laptop.glb` | 75356 | 1692 | 0.329 × 0.213 × 0.255 |
| plant | [Studio Plant Pot (Tattoo and Piercing Studio)](https://3dassets.dev/assets/tattoo-and-piercing-studio-studio-plant-pot-7ee5b536) | `assets/models/plant.glb` | 40208 | 1036 | 0.810 × 1.672 × 0.854 |
| speaker | [PA Speaker on a Stand (Village Hall and Community Events)](https://3dassets.dev/assets/village-hall-and-community-events-pa-speaker-on-stand-7ffa787e) | `assets/models/speaker.glb` | 19788 | 412 | 0.724 × 1.809 × 0.693 |

Total download size: **262,516 bytes** (256.4 KiB); **5,638 triangles** across the five unique source models.

## Validation and placement

- Every file has a valid GLB 2.0 header with matching declared length, a JSON scene, and an embedded binary buffer.
- All accessors and buffer views were checked against byte ranges; index values were checked against vertex counts. All vertex components are finite, every primitive has a valid material, and triangle counts match the provider metadata.
- Bounds were recomputed from decoded quantized positions and the full default scene node transforms, and match the API within 1 mm.
- All assets use metres with **+Y up**. Their origin is at or within 0.02 mm of their base. Renderer code may subtract the actual Box3 minimum Y for exact placement.
- `KHR_mesh_quantization` is used. No Draco, meshopt, KTX2, remote image, or remote buffer dependency is required. Preserve the imported node transforms when cloning assets.
- The table contains open/close animations for its cable-box lid. The static default pose is suitable for this venue; animation playback is optional.

- **table**: 1.6 m 长边沿 X；桌面约 0.73 m，模型最高点 0.742 m 为线盒盖。保持默认闭合姿态；长桌建议沿 X 拼接。
- **chair**: 现代浅灰可叠椅，座面约 0.45 m；椅背位于 -Z，乘坐朝向 +Z。
- **laptop**: 银色机身、深色键盘与发光屏幕；屏幕位于 -Z，使用者侧在 +Z。放在桌面上方约 0.002 m。
- **plant**: 深色支架、白盆、绿色宽叶，含少量品红盆饰；叶片不需外部纹理。
- **speaker**: 含三脚支架，正面朝 +Z；舞台两侧布置时朝向观众区。

## Exact downloads

- **table**: [official metadata](https://3dassets.dev/api/v1/assets/hotel-and-resort-operations-conference-table-module-a6abb373) · [original GLB](https://cdn.3dassets.dev/assets/25917/v1/model.glb) · [license](https://creativecommons.org/publicdomain/zero/1.0/)
  - SHA-256: `85a08d3f62713c7c78df5a6974b2025b240fae163b795dd61ff1b7011c23f854`
- **chair**: [official metadata](https://3dassets.dev/api/v1/assets/office-lobby-and-facilities-canteen-stacking-chair-3440c7d8) · [original GLB](https://cdn.3dassets.dev/assets/26231/v1/model.glb) · [license](https://creativecommons.org/publicdomain/zero/1.0/)
  - SHA-256: `0ef21a9011a00e92766aa88fb434927ccbf85b47d4746c6e39228ca27e2f9813`
- **laptop**: [official metadata](https://3dassets.dev/api/v1/assets/computers-and-desk-gadgets-laptop-convertible-flip-068fe56f) · [original GLB](https://cdn.3dassets.dev/assets/38825/v1/model.glb) · [license](https://creativecommons.org/publicdomain/zero/1.0/)
  - SHA-256: `653437c34a05208daa868e46165843455099e01656d4da67c54183e67c78978a`
- **plant**: [official metadata](https://3dassets.dev/api/v1/assets/tattoo-and-piercing-studio-studio-plant-pot-7ee5b536) · [original GLB](https://cdn.3dassets.dev/assets/34557/v1/model.glb) · [license](https://creativecommons.org/publicdomain/zero/1.0/)
  - SHA-256: `a4ecf82c56717032ca0cb588d1664c3de7867971f2dce6a364a794a341b6df9a`
- **speaker**: [official metadata](https://3dassets.dev/api/v1/assets/village-hall-and-community-events-pa-speaker-on-stand-7ffa787e) · [original GLB](https://cdn.3dassets.dev/assets/35204/v1/model.glb) · [license](https://creativecommons.org/publicdomain/zero/1.0/)
  - SHA-256: `46083c231cbd4d24dd60ef7306f35577aea7c8b8f6b3f74b8fc4ea160b28106a`
