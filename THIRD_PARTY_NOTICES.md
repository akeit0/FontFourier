# Third-party software and references

Credits for the libraries, fonts, and audio model used by this demo.

The project's [Unlicense](LICENSE) applies to original code. Third-party components retain the licenses listed below.

## JavaScript

- **d3-contour 4.0.2** — contour extraction using marching squares. Loaded from jsDelivr as an ES module; its transitive dependencies are served by that CDN. [Source and license](https://github.com/d3/d3-contour/tree/v4.0.2), [ISC license text](https://github.com/d3/d3-contour/blob/v4.0.2/LICENSE).
- **d3-array** — a transitive dependency of d3-contour. [Source](https://github.com/d3/d3-array), [ISC license](https://github.com/d3/d3-array/blob/main/LICENSE).
- **Playwright** — development-only browser testing and screenshot capture; not shipped with the site. [Source and Apache-2.0 license](https://github.com/microsoft/playwright).

## Web fonts

Fonts are requested at runtime through the [Google Fonts CSS API](https://developers.google.com/fonts/docs/css2); font binaries are not included in this repository. The preset families use the SIL Open Font License 1.1:

| Family | Upstream license |
| --- | --- |
| Noto Sans JP | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/notosansjp/OFL.txt) |
| Noto Serif JP | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/notoserifjp/OFL.txt) |
| M PLUS Rounded 1c | [Google Fonts license metadata](https://github.com/google/fonts/blob/main/ofl/mplusrounded1c/METADATA.pb) |
| Zen Kaku Gothic New | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/zenkakugothicnew/OFL.txt) |
| Zen Old Mincho | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/zenoldmincho/OFL.txt) |
| Roboto | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/roboto/OFL.txt) |
| Playfair Display | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/playfairdisplay/OFL.txt) |

Custom families can have different terms. Check the upstream license if changing the preset list or distributing font files.

## Psychoacoustic references

- [ISO 226:2003 — Acoustics: Normal equal-loudness-level contours](https://www.iso.org/standard/34222.html). The `af`, `Lu`, and `Tf` parameters in `assets/app.js` provide a frequency-sensitivity reference. The 2003 edition was withdrawn and superseded by ISO 226:2023.
- Zwicker, E. & Terhardt, E. (1980). *Analytical expressions for critical-band rate and critical bandwidth as a function of frequency.* Journal of the Acoustical Society of America, 68(5), 1523–1525. [DOI: 10.1121/1.385079](https://doi.org/10.1121/1.385079).

Audio normalization uses a custom equal-loudness and Bark-band model, rather than a standards-compliant loudness measurement.
