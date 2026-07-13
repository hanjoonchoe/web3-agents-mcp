<div align="center">

# web3-agents-mcp

### オンチェーン AI エージェントを発見・照会・検証 — あらゆる MCP クライアントから。

[English](README.md) | **日本語** | [中文](README.zh.md) | [한국어](README.ko.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![ERC-8004](https://img.shields.io/badge/standard-ERC--8004-627EEA)](https://eips.ethereum.org/EIPS/eip-8004)
[![Chains](https://img.shields.io/badge/chains-7-informational)](#%EF%B8%8F-サポートチェーン)
[![Tests](https://img.shields.io/badge/tests-165%20passing-success)](test)

[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) のエージェント・アイデンティティ／
レピュテーション／バリデーション・レジストリを、あらゆる AI エージェントが呼び出せる MCP
ツールへ橋渡しするサーバーです。サーバーひとつで対応全チェーンをカバー — すべてのツールが
`chain` 引数を取ります。

</div>

---

## 📋 目次

- [なぜ必要か](#-なぜ必要か)
- [クイックスタート](#-クイックスタート)
- [プロンプト例](#-プロンプト例)
- [ツール](#-ツール)
- [設計原則](#%EF%B8%8F-設計原則)
- [サポートチェーン](#%EF%B8%8F-サポートチェーン)
- [設定](#%EF%B8%8F-設定)
- [検証セマンティクス](#-検証セマンティクス)
- [フィードバックの誠実さ](#-フィードバックの誠実さ)
- [開発](#%EF%B8%8F-開発)
- [ロードマップ](#%EF%B8%8F-ロードマップ)
- [ライセンス](#-ライセンス)

## 🤔 なぜ必要か

AI エージェントは他のエージェントを雇い、支払い、作業を委任し始めています。ERC-8004
（"Trustless Agents"）は 20 以上の EVM チェーンに展開されたアイデンティティ／レピュテー
ション／バリデーションのレジストリというオンチェーン信頼レイヤーを提供しますが、これまで
LLM エージェントは自らのツールループの中からそれを読む手段がありませんでした。

**web3-agents-mcp がそのギャップを埋めます。** エージェントが相手を信頼する前に、こう
問い合わせられます：このエージェントの所有者は誰か？ 登録ファイルは本物か？ どんな
フィードバックを — 誰から — 受けているか？ その仕事を独立に検証した者はいるか？

## 🚀 クイックスタート

```sh
npx web3-agents-mcp
```

> npm リリース前はチェックアウトから — `pnpm install && pnpm build && node dist/server/index.js`

**Claude Code:**

```sh
claude mcp add web3-agents -- npx web3-agents-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "web3-agents": {
      "command": "npx",
      "args": ["web3-agents-mcp"]
    }
  }
}
```

**その他の MCP クライアント:** `npx web3-agents-mcp` を子プロセスとして起動し、stdio で
MCP を話してください。サーバーはネットワークポートを開きません。

## 💬 プロンプト例

接続後は、エージェントに自然に尋ねるだけです：

> _「web3-agents サーバーが対応しているチェーンを教えて」_
>
> _「Base の ERC-8004 エージェント #1 を調べて — 所有者は誰で、何をするエージェント？」_
>
> _「エージェント #42 の登録ファイルは暗号学的に検証済み？」_
>
> _「Base のエージェント #1 への生のフィードバックを、送信者アドレス付きで見せて」_
>
> _「コードレビュー作業に Polygon のエージェント #0 を信頼していい？ オンチェーンの事実を取ってきて」_

## 🧰 ツール

| ツール                  | 返す内容                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `list_chains`           | 設定済みチェーン：スラッグ、chainId、レジストリアドレス、デフォルトフラグ                        |
| `resolve_agent`         | agentId または所有者アドレスからアイデンティティレコード：所有者、tokenUri、エンドポイント、能力 |
| `get_registration_file` | エージェントの**登録ファイル全文** — 取得しハッシュ検証（`data:`/`ipfs://`/`https://`）          |
| `get_reputation`        | フィードバック要約 + 任意で**クライアント別の生エントリ**（アドレス、スコア、タグ）、ページング  |
| `get_validations`       | 独立検証エントリ：バリデータ、方式（TEE/ZK/再実行）、結果                                        |
| `assess_trust`          | **複合の事実レポート**：アイデンティティ + ファイル検証 + 評判 + 検証 + 注意事項 + 平文要約      |
| `search_agents`         | 能力ベース検索（インデクサバックエンド — MVP はスタブ）                                          |
| `ping`                  | 死活確認 + バージョン                                                                            |

完全な入出力スキーマ・デフォルト値・エラーコードはソースから
[`docs/tools.md`](docs/tools.md) に生成されます（`pnpm docs:gen`）。実際の呼び出し記録は
[`docs/demo.md`](docs/demo.md) にあります。

## 🛡️ 設計原則

> ### 🔒 読み取り専用設計
>
> 秘密鍵なし、署名なし、書き込み操作なし — すべてのツールは公開状態の読み取りです。LLM から
> 到達可能な MCP ツール表面に、オンチェーン行為（資金移動、登録変更、フィードバック送信）への
> インジェクション経路があってはなりません。書き込みが必要なら、それは別の明示的に承認された
> ツールの仕事です — このサーバーではありません。

> ### ⚖️ スコアリングなし設計
>
> このサーバーの出力のどこにも数値スコア・信頼度・星評価はありません。返すのは**検証済みの
> オンチェーンの事実と必須の注意事項**であり、それを信頼判断に統合するのは消費するエージェント
> の仕事です。「フィードバック 57 件、すべて単一アドレスから、独立検証なし」を黙って一つの
> 数字に圧縮するサーバーは、消費者に代わってすべきでない判断をしています。

## ⛓️ サポートチェーン

| チェーン         | `chain` 値 | chainId | サポート |
| ---------------- | ---------- | ------- | -------- |
| Ethereum Mainnet | `ethereum` | 1       | ✅       |
| Base Mainnet     | `base`     | 8453    | ✅       |
| Polygon PoS      | `polygon`  | 137     | ✅       |
| Arbitrum One     | `arbitrum` | 42161   | ✅       |
| OP Mainnet       | `optimism` | 10      | ✅       |
| BNB Smart Chain  | `bnb`      | 56      | ✅       |
| Gnosis Chain     | `gnosis`   | 100     | ✅       |

レジストリアドレスは全チェーンで同一です（CREATE2）。チェーン追加は
`src/chains/config.ts` の 1 エントリで、エージェントは `list_chains` で最新リストを取得
でき、各ツールスキーマの `chain` enum も自動的に更新されます。

## ⚙️ 設定

設定はすべて環境変数です。各ツール呼び出しは引き続き明示的な `chain` 引数を取るため、これら
はデフォルト値であってグローバルスイッチではありません。

| 変数                | デフォルト                                                                 | 用途                                                                                        |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `DEFAULT_CHAIN_ID`  | `8453` (Base)                                                              | `chain` を省略した呼び出しに使うチェーン id。                                               |
| `RPC_URL_<chainId>` | なし（チェーンごとの組み込み公開 RPC リスト）                              | 特定チェーン id の RPC エンドポイントを上書き／優先。例：`RPC_URL_8453`。                   |
| `CACHE_DIR`         | `~/.cache/web3-agents-mcp`                                                 | 取得済み登録ファイルのローカル sqlite キャッシュのディレクトリ。                            |
| `IPFS_GATEWAYS`     | `https://ipfs.io,https://cloudflare-ipfs.com,https://gateway.pinata.cloud` | `ipfs://` 登録ファイルに順に試す IPFS HTTP ゲートウェイのカンマ区切りリスト。               |
| `LOG_LEVEL`         | `info`                                                                     | `error`、`warn`、`info`、`debug` のいずれか。stderr ログの詳細度。                          |
| `INDEX_BACKEND`     | `null`                                                                     | `search_agents` バックエンド選択。現在 `null`（MVP スタブ、常に `INDEX_UNAVAILABLE`）のみ。 |

## 🔍 検証セマンティクス

登録ファイルの `verified` 値は、`tokenUri` がファイルを指す方式によって意味が異なります
（本サーバーが対象とする v1 ERC-8004 コントラクト基準）：

| `tokenUri` スキーム | `verified` 値         | 理由                                                                                                                                                                                        |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data:` URI         | `true`                | 内容はオンチェーンの `tokenUri` に直接埋め込まれ、取得も偽装も不可能です。                                                                                                                  |
| `ipfs://`           | `true` または `false` | IPFS ゲートウェイから取得し、コンテンツハッシュを URI 内の CID と照合 — 明示的な `false` は検証失敗を意味します。                                                                           |
| `https://`          | `null`                | 検証不能：v1 には `https://` ファイルへのオンチェーンハッシュコミットがなく、取得バイト列が実際にコミットされたものか確認できません。`null` は `false` と混同されない意図的に別個の値です。 |

## 🧂 フィードバックの誠実さ

`get_reputation` と `assess_trust` は、フィードバック由来のデータに常に注意事項を添付します。
オンチェーンのフィードバックには、どんな集計でも覆い隠せない構造的弱点があるからです：

- レジストリが強制する標準スコアスケールは存在しません。平均は 0-100 にクランプされ、実際に
  使われたスケールに対して品質を過大評価する可能性があります。
- フィードバックは任意のアドレスが送信でき、シビル（Sybil）攻撃が可能です — 同一主体が複数
  アドレスで大量のエントリを送ることを妨げるものはありません。

これらの注意事項は決定的で除去不能です：常に出力に含まれ、オプトインのフラグではありません。

## 🛠️ 開発

```sh
pnpm install
pnpm dev        # ビルドして stdio サーバーを実行
pnpm build      # TypeScript を dist/ へコンパイル
pnpm test       # vitest スイート（実チェーンのフォークテストを除く）
pnpm test:fork  # 公開 RPC に対する実チェーンのフォークテスト
pnpm lint       # eslint + prettier --check
pnpm typecheck  # tsc --noEmit
pnpm docs:gen   # ツールスキーマから docs/tools.md を再生成
```

プロジェクト構成：

- `src/chains` — チェーンごとの静的設定（レジストリアドレス、デプロイブロック、RPC URL）。
- `src/registry` — ERC-8004 各コントラクトへの型付き読み取り。
- `src/fetcher` — 登録ファイル取得、ハッシュ／CID 検証、sqlite キャッシュ。
- `src/trust` — `assess_trust` のオーケストレーション、決定的注意事項、要約テキスト。
- `src/indexer` — `search_agents` バックエンド契約と MVP `NullBackend` スタブ。
- `src/tools` — MCP ツールごとのモジュール：入出力 zod スキーマ + ツール関数。
- `src/server` — MCP サーバー配線、ツール登録、stdio エントリポイント。
- `src/shared` — 共通の `Result`／`BridgeError` 型と stderr ロガー。

コントリビュータ／エージェント向けガイドラインは [AGENTS.md](AGENTS.md) にあります。

## 🗺️ ロードマップ

- [ ] **ローカル検索インデクサ** — 実働 `search_agents` バックエンド（SQLite ログバックフィル、再開可能）
- [ ] **エンドポイント死活チェック** — 公表エンドポイントが死んでいるエージェントの明示
- [ ] **Streamable HTTP トランスポート** — ホスト型／共有デプロイ
- [ ] **npm リリース** — チェックアウト不要の `npx web3-agents-mcp`
- [ ] さらなるチェーン対応（1 チェーン = 設定 1 エントリ）

## 📄 ライセンス

MIT — [LICENSE](LICENSE) を参照。
