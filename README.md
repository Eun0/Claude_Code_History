# History Viewer for Claude Code

Claude Code 대화 히스토리를 웹에서 브라우징하고, 가치 있는 부분을 **발췌+메모**해서 팀원들에게 단일 HTML / Markdown으로 공유하는 로컬 툴.

> Anthropic과 제휴/후원 관계가 없는 **비공식 뷰어**입니다. "Claude" 및 "Claude Code"는 Anthropic, PBC의 상표입니다.

## 기능

- 📂 `~/.claude/projects/` 의 모든 프로젝트/세션 목록
  - Claude Code의 lossy 경로 인코딩(`my.app_name` → `-my-app-name`)을 세션 `cwd` 필드에서 무손실 복원
- 💬 user / assistant / tool_use / tool_result / thinking / image / sidechain(subagent) 렌더링
- 🎨 Shiki 코드 하이라이팅 + GFM Markdown
- 🔎 전역 검색 (텍스트 + 툴 필터 + 날짜 범위), `/` 단축키
- ✂️ 메시지 범위 선택 → **메모** 저장 (제목 + Markdown 노트)
- 🖱 메모 드래그로 순서 재배치, 원본 메시지로 점프
- 🏷 **보드 타이틀** 편집 (세션별 커스텀 제목, 기본값 "Claude Memos")
- 👁 **Preview & Edit** — 새 탭에서 Edit / Preview 모드 토글 가능한 라이브 뷰
  - Edit 모드: 대타이틀, 메모 제목, 메모 노트 인라인 편집 (자동 저장)
  - 대화 메시지는 읽기 전용
  - 편집 내용이 **BroadcastChannel**로 메인 탭에 즉시 동기화
- ⬇ **Export HTML** — 단일 self-contained HTML (더블클릭으로 오프라인 열람)
- 📋 **Copy Markdown** — 위키/노션 등에 바로 붙여넣기
- ↻ **Resume 명령 복사** — `cd "<cwd>" && claude --resume <sessionId>` 를 클립보드로
- 🧹 thinking / system event 토글로 가독성 조정

## 실행

```bash
npm install

# dev: Vite(5173) + Fastify(5174) 동시 기동
npm run dev
# 브라우저: http://localhost:5173

# prod: 단일 포트 5174 에서 정적 + API 동시 서빙
npm run build
npm start
# 브라우저: http://localhost:5174
```

> `node server/index.js`는 nodemon 없이 돌아가므로, 서버 코드(`server/`) 수정 시 `Ctrl+C` 후 다시 `npm run dev`.

## 데이터 위치

- **세션 원본** (read-only): `~/.claude/projects/<encoded-project>/<session-id>.jsonl`
- **메모/타이틀** (runtime): `./data/memos/<sessionId>.json` *(gitignored)*
- **빌드 산출물**: `./dist/` (`viewer.min.js` 포함 — export HTML 에 인라인됨)

## API

모든 라우트는 Fastify(5174) 에서 제공.

### 프로젝트 / 세션

| Method | Path |
|---|---|
| `GET` | `/api/projects` |
| `GET` | `/api/projects/:id/sessions` |
| `GET` | `/api/projects/:id/sessions/:sessionId` |

### 메모 (per-session)

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/sessions/:sessionId/memos` | 보드 전체 조회 (`title`, `memos[]`) |
| `PATCH` | `/api/sessions/:sessionId/memos` | 보드 타이틀 수정 (`{title}`) |
| `POST` | `/api/sessions/:sessionId/memos` | 메모 생성 |
| `PATCH` | `/api/sessions/:sessionId/memos/:memoId` | 메모 수정 (`title`, `note`, `order`) |
| `DELETE` | `/api/sessions/:sessionId/memos/:memoId` | 메모 삭제 |

### 메모 (cross-session)

| Method | Path |
|---|---|
| `GET` | `/api/memos` |

### Export / Preview

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/sessions/:sessionId/memos/export` | 다운로드용 self-contained HTML |
| `GET` | `/api/sessions/:sessionId/memos/preview` | 편집 가능한 라이브 HTML (edit 모드 활성화) |
| `GET` | `/api/sessions/:sessionId/memos/markdown` | Markdown 내보내기 |

### 검색

| Method | Path |
|---|---|
| `GET` | `/api/search?q=<text>&tool=<name>&from=<iso>&to=<iso>` |

## 워크플로

### 메모 만들기

1. 세션을 연 뒤 메시지 위에 마우스 hover → 왼쪽에 체크박스
2. 체크박스 클릭으로 **선택 모드** 진입, 다른 메시지 추가 선택, **Shift+클릭**으로 범위 선택
3. 하단 플로팅 바의 **Add to memo** → 제목(선택) + 노트(Markdown) 작성 후 Save
4. 우측 **메모 패널**에 카드가 추가됨 — 드래그로 순서 변경, 클릭으로 원본 메시지로 점프, Edit/Delete

### 공유

메모 패널 상단의 타이틀 입력란에 제목을 쓰고(비우면 "Claude Memos"), 하단 버튼으로:

- **Export as HTML** — 단일 파일 다운로드 (`claude-memos-<sid>-<date>.html`)
- **Preview & Edit** — 새 탭에서 렌더된 모습 확인, Edit 모드로 인라인 편집
- **Copy as Markdown** — 클립보드에 복사 (위키/노션/Slack 등에 붙여넣기)

### Resume

세션 헤더의 **`↻ resume`** 버튼 → 클립보드에 복사되는 명령어:

```bash
cd "<원본 cwd>" && claude --resume <sessionId>
```

터미널에 붙여넣으면 해당 세션으로 이어서 작업 시작.

## 구조

```
server/            # Fastify 서버 (projects, sessions, memos, search, export)
src/lib/           # 서버/클라이언트 공용 ESM (parseMessages, formatTools, ...)
src/state/         # 클라이언트 memo 스토어 (useSyncExternalStore)
src/components/    # React 컴포넌트
src/pages/         # 라우트 페이지
export-template/   # Export/Preview HTML 템플릿 + vanilla JS 렌더러 (viewer.js)
scripts/           # viewer.js esbuild 번들 스크립트
data/memos/        # 메모 JSON (런타임 생성, gitignored)
```

## 단축키

- `/` : 상단 검색창 포커스
- `Esc` : 모달 / 편집 textarea 닫기
- 메시지 체크박스 `Shift+클릭` : 범위 선택
- Preview & Edit 모드에서 편집 중 `Enter` : 제목 편집 확정 / `Esc` : 노트 편집 취소

## 라이선스

MIT. 자세한 내용은 [LICENSE](./LICENSE) 참고.
