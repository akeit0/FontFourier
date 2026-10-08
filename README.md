# Font Fourier Epicycles

[Open demo / デモを開く](https://akeit0.github.io/FontFourier/) · [GitHub](https://github.com/akeit0/FontFourier)

[English](#english) · [日本語](#日本語)

![F reconstructed with Fourier epicycles](assets/thumbnail.png)

*F · Roboto · Fourier order 40*

## English

Explore font outlines as rotating circles and stereo sound. A complex Fourier series reconstructs each contour, using the same coefficients for the animation and audio.

- Japanese browsers start with **あ / Noto Sans JP**; other languages start with **A / Roboto**.
- Epicycles appear automatically. Audio starts when you select **Analyze & play** or press Enter in the text field.
- Use Settings to change the font, Fourier order, animation, and sound. Added Google Fonts are saved in your browser.
- Switch between **EN / 日本語** without changing your text or selected font.
- Characters absent from the selected font use the browser’s fallback font, with a notice. The displayed outlines are used for analysis.
- Playback stops after two seconds by default. Turn off Auto stop for continuous playback.

Fourier order sets the maximum `|k|` in both rotation directions. For example, order 40 covers −40 through +40, including DC.

To run locally, open `index.html` in your browser. An internet connection is required for fonts and contour analysis. Font requests to Google Fonts include the selected family, weight, and text.

## 日本語

文字の輪郭を、回転する円とステレオ音声で楽しむデモです。複素フーリエ級数で各輪郭を再構成し、同じ係数をアニメーションと音声に使います。

- 日本語のブラウザでは **あ / Noto Sans JP**、それ以外では **A / Roboto** で始まります。
- エピサイクルは自動で表示されます。**解析して鳴らす** または文字欄のEnterで音声を再生します。
- 設定からフォント・フーリエ項数・アニメーション・音声を調整できます。追加したGoogle Fontsはブラウザに保存されます。
- **EN / 日本語** を切り替えても、入力文字と選択フォントを保持します。
- 選択したフォントにない文字はブラウザの代替フォントで表示し、その旨を案内します。表示した輪郭をそのまま解析します。
- 音声は初期設定で2秒後に停止します。連続再生する場合は自動停止をオフにしてください。

フーリエ項数は、正負両方向の最大次数 `|k|` です。40ではDCを含む−40〜+40を扱います。

ローカルでは `index.html` をブラウザで開いてください。フォントと輪郭解析の読み込みにインターネット接続が必要です。Google Fontsには選択したフォント名・ウェイト・文字列が送信されます。

## Development

Node.js 24 or later:

```sh
npm ci
npx playwright install chromium
npm run dev
```

- `npm test` — browser tests
- `npm run check` — syntax, translations, and assets
- `npm run build` — static site in `_site/`
- `npm run thumbnail` — cropped F at Fourier order 40

## License

Original code: [Unlicense](LICENSE). Third-party libraries and fonts retain their [respective licenses](THIRD_PARTY_NOTICES.md).

独自コードは [Unlicense](LICENSE) です。第三者ライブラリ・フォントには[それぞれのライセンス](THIRD_PARTY_NOTICES.md)が適用されます。
