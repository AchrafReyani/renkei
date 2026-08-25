# コントリビューションガイド / Contributing

> English follows Japanese. / 日本語の後に英語があります。

## 日本語

renkei への貢献に興味を持ってくださってありがとうございます。

### 言語について

- **Issue・PRの説明・Discussions は日本語で大丈夫です。** 英語が得意でなくても問題ありません。
- コードの識別子・コメント・コミットメッセージは英語です。台湾・タイの開発者や世界中のレビュアーにも読めるようにするためです（理由は [`docs/DECISIONS.md`](docs/DECISIONS.md) §3）。英語のコメントに自信がなければ、日本語で書いて PR に「英訳お願いします」と添えてください。メンテナーが直します。
- ドキュメントは日本語が正で、英語版を同じ PR で更新します。英語版は機械翻訳＋軽い手直しで構いません。

### 貢献の種類

| 種類 | 場所 | 目安 |
|---|---|---|
| バグ報告・質問 | Issue / Discussions | 気軽にどうぞ |
| ドキュメント修正 | `docs/` | そのまま PR |
| サンプル追加（Rails・Laravel・Spring など） | `examples/<name>/` | テンプレートをコピー、CI が通れば OK |
| ストレージアダプター（MySQL など） | `packages/storage-<name>/` | Issue を先に |
| `core` / `server` の変更 | — | **必ず Issue を先に。** トークン検証やクレームに触る変更は `docs/rfcs/` に1ページの RFC |
| LINE API の仕様変更への追従 | `line-api-change` ラベル | 最優先で見ます |

### 手順

1. Issue があるか確認（無ければ作る）。`good first issue` / `help wanted` から選ぶのが早いです。
2. Fork → ブランチ → 変更。
3. `pnpm lint && pnpm test` を通す。
4. コミットに DCO 署名を付ける：`git commit -s`（CLA はありません）。
5. PR を出す。テンプレートのチェックリストを埋める。
6. 24時間以内に返事します。

### 行動規範

[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) に従ってください。

---

## English

Thanks for your interest in contributing to renkei.

### Language

- **Issues, PR descriptions and Discussions may be in Japanese or English.**
- Code identifiers, comments and commit messages are in English so that
  Taiwanese, Thai and worldwide reviewers can read them (reasoning in
  [`docs/DECISIONS.md`](docs/DECISIONS.md) §3).
- Documentation is Japanese-first; the English mirror is updated in the same
  PR. If you only write one language, say so and a maintainer will do the
  other.

### Kinds of contribution

| Kind | Where | Process |
|---|---|---|
| Bug reports, questions | Issues / Discussions | Just file it |
| Docs fixes | `docs/` | Straight PR |
| Examples (Rails, Laravel, Spring, …) | `examples/<name>/` | Copy the template; green CI is the bar |
| Storage adapters (MySQL, …) | `packages/storage-<name>/` | Open an issue first |
| Changes to `core` / `server` | — | **Issue first.** Anything touching token verification or claims needs a one-page RFC in `docs/rfcs/` |
| LINE API changes | label `line-api-change` | Highest priority |

### Steps

1. Find or open an issue. `good first issue` / `help wanted` are the quickest start.
2. Fork → branch → change.
3. `pnpm lint && pnpm test`.
4. Sign off commits with DCO: `git commit -s` (there is no CLA).
5. Open the PR and fill in the template checklist.
6. You'll hear back within 24 hours.

### Code of conduct

See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
