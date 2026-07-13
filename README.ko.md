<div align="center">

# web3-agents-mcp

### 온체인 AI 에이전트를 발견하고, 조회하고, 검증하세요 — 어떤 MCP 클라이언트에서든.

[English](README.md) | [日本語](README.ja.md) | [中文](README.zh.md) | **한국어**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![ERC-8004](https://img.shields.io/badge/standard-ERC--8004-627EEA)](https://eips.ethereum.org/EIPS/eip-8004)
[![Chains](https://img.shields.io/badge/chains-7-informational)](#%EF%B8%8F-지원-체인)
[![Tests](https://img.shields.io/badge/tests-165%20passing-success)](test)

[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) 에이전트 아이덴티티·평판·검증
레지스트리를 어떤 AI 에이전트든 호출할 수 있는 MCP 도구로 연결하는 서버입니다.
서버 하나로 지원되는 모든 체인을 다룹니다 — 모든 도구가 `chain` 인자를 받습니다.

</div>

---

## 📋 목차

- [왜 필요한가](#-왜-필요한가)
- [빠른 시작](#-빠른-시작)
- [프롬프트 예시](#-프롬프트-예시)
- [도구](#-도구)
- [설계 원칙](#%EF%B8%8F-설계-원칙)
- [지원 체인](#%EF%B8%8F-지원-체인)
- [설정](#%EF%B8%8F-설정)
- [검증 의미론](#-검증-의미론)
- [피드백의 정직성](#-피드백의-정직성)
- [개발](#%EF%B8%8F-개발)
- [로드맵](#%EF%B8%8F-로드맵)
- [라이선스](#-라이선스)

## 🤔 왜 필요한가

AI 에이전트들이 다른 에이전트를 고용하고, 결제하고, 작업을 위임하기 시작했습니다.
ERC-8004("Trustless Agents")는 그들에게 온체인 신뢰 계층 — 20개 이상의 EVM 체인에 배포된
아이덴티티·평판·검증 레지스트리 — 을 제공하지만, 지금까지 LLM 에이전트는 자신의 도구 루프
안에서 그것을 읽을 방법이 없었습니다.

**web3-agents-mcp가 그 간극을 메웁니다.** 에이전트가 상대방을 신뢰하기 전에 이렇게 물을 수
있습니다: 이 에이전트의 소유자는 누구인가? 등록 파일은 진본인가? 어떤 피드백을 — 누구에게서 —
받았는가? 누군가 그 작업을 독립적으로 검증했는가?

## 🚀 빠른 시작

```sh
npx web3-agents-mcp
```

> npm 릴리스 이전에는 체크아웃에서 실행하세요 — `pnpm install && pnpm build && node dist/server/index.js`

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

**기타 MCP 클라이언트:** `npx web3-agents-mcp`를 자식 프로세스로 실행하고 stdio로 MCP를
사용하세요. 서버는 네트워크 포트를 열지 않습니다.

## 💬 프롬프트 예시

연결한 뒤에는 에이전트에게 자연스럽게 물어보면 됩니다:

> _"web3-agents 서버가 지원하는 체인을 알려줘"_
>
> _"Base의 ERC-8004 에이전트 #1을 조회해줘 — 소유자는 누구고 무엇을 하는 에이전트야?"_
>
> _"에이전트 #42의 등록 파일이 암호학적으로 검증되었는지 확인해줘"_
>
> _"Base의 에이전트 #1이 받은 원시 피드백을 제출자 주소와 함께 보여줘"_
>
> _"코드 리뷰 작업에 Polygon의 에이전트 #0을 신뢰해도 될까? 온체인 사실을 가져와줘"_

## 🧰 도구

| 도구                    | 반환 내용                                                                         |
| ----------------------- | --------------------------------------------------------------------------------- |
| `list_chains`           | 설정된 체인: 슬러그, chainId, 레지스트리 주소, 기본값 여부                        |
| `resolve_agent`         | agentId 또는 소유자 주소로 아이덴티티 레코드: 소유자, tokenUri, 엔드포인트, 능력  |
| `get_registration_file` | 에이전트의 **전체 등록 파일** — 가져와서 해시 검증(`data:`/`ipfs://`/`https://`)  |
| `get_reputation`        | 피드백 요약 + 선택적 **클라이언트별 원시 항목**(주소, 점수, 태그), 페이지네이션   |
| `get_validations`       | 독립 검증 항목: 검증자, 방식(TEE/ZK/재실행), 결과                                 |
| `assess_trust`          | **복합 사실 보고서**: 아이덴티티 + 파일 검증 + 평판 + 검증 + 주의사항 + 평문 요약 |
| `search_agents`         | 능력 기반 검색(인덱서 백엔드 — MVP는 스텁)                                        |
| `ping`                  | 상태 확인 + 버전                                                                  |

전체 입력/출력 스키마, 기본값, 오류 코드는 소스에서 생성되는
[`docs/tools.md`](docs/tools.md)에 있습니다(`pnpm docs:gen`). 실제 호출 기록은
[`docs/demo.md`](docs/demo.md)에 있습니다.

## 🛡️ 설계 원칙

> ### 🔒 읽기 전용 설계
>
> 프라이빗 키 없음, 서명 없음, 쓰기 작업 없음 — 모든 도구는 공개 상태를 읽기만 합니다. LLM이
> 접근하는 MCP 도구 표면에는 온체인 행위(자금 이동, 등록 변경, 피드백 제출)로 이어지는 인젝션
> 경로가 절대 있어서는 안 됩니다. 쓰기가 필요하다면 별도의 명시적으로 승인된 도구가 필요합니다 —
> 이 서버가 아닙니다.

> ### ⚖️ 점수 없음 설계
>
> 이 서버의 출력 어디에도 숫자 점수, 신뢰도, 별점이 없습니다. **검증된 온체인 사실과 필수
> 주의사항**만 돌려주며, 그것을 신뢰 판단으로 종합하는 것은 소비하는 에이전트의 몫입니다.
> "피드백 57건, 전부 한 주소에서, 독립 검증 없음"을 조용히 숫자 하나로 압축하는 서버는
> 소비자를 대신해 해서는 안 될 판단을 하는 것입니다.

## ⛓️ 지원 체인

| 체인             | `chain` 값 | chainId | 지원 |
| ---------------- | ---------- | ------- | ---- |
| Ethereum Mainnet | `ethereum` | 1       | ✅   |
| Base Mainnet     | `base`     | 8453    | ✅   |
| Polygon PoS      | `polygon`  | 137     | ✅   |
| Arbitrum One     | `arbitrum` | 42161   | ✅   |
| OP Mainnet       | `optimism` | 10      | ✅   |
| BNB Smart Chain  | `bnb`      | 56      | ✅   |
| Gnosis Chain     | `gnosis`   | 100     | ✅   |

레지스트리 주소는 모든 체인에서 동일합니다(CREATE2). 체인 추가는 `src/chains/config.ts`의
항목 하나이며, 에이전트는 `list_chains` 도구로 실시간 목록을 확인하고 모든 도구 스키마의
`chain` enum도 자동으로 갱신됩니다.

## ⚙️ 설정

모든 설정은 환경 변수로 합니다. 각 도구 호출은 여전히 명시적 `chain` 인자를 받으므로 이 값들은
기본값이지 전역 스위치가 아닙니다.

| 변수                | 기본값                                                                     | 용도                                                                                   |
| ------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `DEFAULT_CHAIN_ID`  | `8453` (Base)                                                              | `chain`을 생략한 도구 호출에 사용되는 체인 id.                                         |
| `RPC_URL_<chainId>` | 없음(체인별 내장 공개 RPC 목록)                                            | 해당 체인 id의 RPC 엔드포인트를 재정의/우선 적용. 예: `RPC_URL_8453`.                  |
| `CACHE_DIR`         | `~/.cache/web3-agents-mcp`                                                 | 가져온 등록 파일의 로컬 sqlite 캐시 디렉터리.                                          |
| `IPFS_GATEWAYS`     | `https://ipfs.io,https://cloudflare-ipfs.com,https://gateway.pinata.cloud` | `ipfs://` 등록 파일에 순서대로 시도할 IPFS HTTP 게이트웨이 목록(쉼표 구분).            |
| `LOG_LEVEL`         | `info`                                                                     | `error`, `warn`, `info`, `debug` 중 하나; stderr 로그 상세도 제어.                     |
| `INDEX_BACKEND`     | `null`                                                                     | `search_agents` 백엔드 선택. 현재는 `null`(MVP 스텁, 항상 `INDEX_UNAVAILABLE`)만 구현. |

## 🔍 검증 의미론

등록 파일의 `verified` 값은 에이전트의 `tokenUri`가 파일을 가리키는 방식에 따라 의미가
다릅니다(이 서버가 대상으로 하는 v1 ERC-8004 컨트랙트 기준):

| `tokenUri` 스킴 | `verified` 값       | 이유                                                                                                                                                                                                |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data:` URI     | `true`              | 내용이 온체인 `tokenUri`에 직접 포함되어 있어 가져오거나 위조할 것이 없습니다.                                                                                                                      |
| `ipfs://`       | `true` 또는 `false` | IPFS 게이트웨이에서 파일을 가져와 URI의 CID와 콘텐츠 해시를 대조합니다 — 명시적 `false`는 그 검증이 실패했다는 뜻입니다.                                                                            |
| `https://`      | `null`              | 검증 불가: v1에는 `https://` 파일에 대한 온체인 해시 커밋이 없어, 가져온 바이트가 에이전트가 실제로 커밋한 것인지 확인할 수 없습니다. `null`은 `false`와 절대 혼동되지 않는 별도의 의도된 값입니다. |

## 🧂 피드백의 정직성

`get_reputation`과 `assess_trust`는 피드백 기반 데이터에 항상 주의사항을 첨부합니다. 온체인
피드백에는 어떤 집계로도 가릴 수 없는 구조적 약점이 있기 때문입니다:

- 레지스트리가 강제하는 표준 점수 스케일이 없습니다. 평균은 0-100으로 클램프되며 실제 사용된
  스케일에 비해 품질을 과대평가할 수 있습니다.
- 피드백은 임의의 주소가 제출하며 시빌(Sybil) 공격이 가능합니다 — 한 주체가 여러 주소로 다수의
  항목을 제출하는 것을 막을 방법이 없습니다.

이 주의사항들은 결정적이며 제거할 수 없습니다: 출력에 항상 포함되고 옵트인 플래그가 아닙니다.

## 🛠️ 개발

```sh
pnpm install
pnpm dev        # 빌드 후 stdio 서버 실행
pnpm build      # TypeScript를 dist/로 컴파일
pnpm test       # vitest 스위트 실행(라이브 체인 포크 테스트 제외)
pnpm test:fork  # 공개 RPC 대상 라이브 체인 포크 테스트
pnpm lint       # eslint + prettier --check
pnpm typecheck  # tsc --noEmit
pnpm docs:gen   # 도구 스키마로부터 docs/tools.md 재생성
```

프로젝트 구조:

- `src/chains` — 체인별 정적 설정(레지스트리 주소, 배포 블록, RPC URL).
- `src/registry` — ERC-8004 아이덴티티/평판/검증 컨트랙트에 대한 타입 지정 읽기.
- `src/fetcher` — 등록 파일 조회, 해시/CID 검증, sqlite 캐시.
- `src/trust` — `assess_trust` 오케스트레이션, 결정적 주의사항, 요약 텍스트.
- `src/indexer` — `search_agents` 백엔드 계약과 MVP `NullBackend` 스텁.
- `src/tools` — MCP 도구별 모듈: 입력/출력 zod 스키마와 도구 함수.
- `src/server` — MCP 서버 배선, 도구 등록, stdio 진입점.
- `src/shared` — 어디서나 쓰이는 `Result`/`BridgeError` 타입과 stderr 로거.

기여자/에이전트 가이드라인은 [AGENTS.md](AGENTS.md)에 있습니다.

## 🗺️ 로드맵

- [ ] **로컬 검색 인덱서** — 실제 `search_agents` 백엔드(SQLite 로그 백필, 재개 가능)
- [ ] **엔드포인트 생존 확인** — 광고된 엔드포인트가 죽은 에이전트 표시
- [ ] **Streamable HTTP 전송** — 호스팅/공유 배포
- [ ] **npm 릴리스** — 체크아웃 없이 `npx web3-agents-mcp`
- [ ] 더 많은 체인(체인당 설정 항목 하나)

## 📄 라이선스

MIT — [LICENSE](LICENSE) 참고.
