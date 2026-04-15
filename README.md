# Claude Code History + Memo

Claude Code 대화 히스토리를 웹에서 브라우징하고, 가치 있는 부분을 **발췌+메모**해서 팀원들에게 단일 HTML / Markdown으로 공유하는 로컬 툴. 여러 세션의 메모를 모아 한 문서로 묶는 cross-session **Editor**도 포함.

> Anthropic과 제휴/후원 관계가 없는 **비공식 뷰어**입니다. "Claude" 및 "Claude Code"는 Anthropic, PBC의 상표입니다.

## 기능

- `~/.claude/projects/` 의 모든 프로젝트/세션 **브라우징**
- 대화 전체 **렌더링** — user / assistant / tool_use / tool_result / thinking / image / sidechain(subagent), Shiki 코드 하이라이팅 + GFM Markdown
- **전역 검색** — 텍스트 + 툴 필터 + 날짜 범위
- **메모** — 메시지 범위를 선택해 제목+Markdown 노트로 저장, 세션별 보드 구성
- **세션 메모 편집** — 사이드 패널의 `Preview & Edit`로 in-app 편집 화면 진입, 인라인으로 보드 타이틀 / 메모 / 순서 / 삭제 + 메인 탭과 자동 동기화
- **Editor (cross-session 작성기)** — 여러 세션의 메모를 두레이 "업무 참조" 방식으로 하나의 문서로 모아 편집, 로컬 드래프트 자동 저장
- **공유** — Download HTML(단일 self-contained) / Copy Markdown / Preview
- **Resume 명령 복사** — `cd "<cwd>" && claude --resume <sessionId>`

## 상세 기능

### 프로젝트 목록
- 카드 그리드 + **검색 / 정렬(Recent·Name) / 페이지네이션**(9개/페이지)
- **숨김 / 숨김 관리** — 카드 hover 시 `×` 버튼으로 숨김(localStorage `projectList.hidden.v1`), 툴바의 `Hidden (N)` 버튼으로 숨김 목록 뷰 진입, `↺` 버튼으로 복구
- 숨긴 프로젝트의 메모는 `/memos` 탭과 `/editor` picker에서도 자동 제외 (공유 헬퍼 `src/state/hiddenProjects.js`)
- Claude Code의 lossy 경로 인코딩(`my.app_name` → `-my-app-name`)을 세션 `cwd` 필드에서 무손실 복원

### 대화 뷰
- **텍스트 드래그 복사** — 행 내에서는 네이티브 텍스트 선택, 여러 행에 걸친 드래그는 메모용 다중 행 선택으로 자동 승격
- **AskUserQuestion 특수 렌더** — 질문은 Claude 메시지에 `**AskUserQuestion 도구 호출**` prefix와 함께 평문으로, 사용자의 선택 답변은 User 버블에 `답변 1: …` 형식으로 표시 (`toolUseResult.answers` 구조화 필드 우선 사용)
- **라이브 업데이트** — 서버가 원본 JSONL을 watch하여 새 메시지가 추가되면 SSE로 푸시, 하단 근처에 있을 경우 자동 스크롤
- thinking / system event 토글로 가독성 조정

### 메모
- 드래그로 순서 재배치, 카드 클릭으로 원본 메시지로 점프
- **Edit Message 모드** — 메모 카드의 `Edit Message` 버튼으로 기존 메모의 메시지 소속을 재편집(추가/제거), 하단 바의 Save/Cancel로 커밋
- **보드 타이틀** 편집 (세션별 커스텀 제목, 기본값 "Claude Memos")
- **Memos 탭** — 상단 네비의 `Memos`에서 세션을 가로지르는 메모 인덱스 조회, 클릭 시 원본 세션의 해당 메시지로 딥링크

### Preview & Edit (세션 메모 편집)
- 메모 사이드 패널의 `Preview & Edit` → 새 탭에서 in-app 편집 화면(`#/sessions/:projectId/:sessionId/edit`) 오픈
- **기본은 Preview 모드** (전체적인 문서 모양을 먼저 보고, 필요할 때만 Edit으로 전환)
- 상단 sticky banner: Edit ↔ Preview 토글 + Download HTML / Copy MD 아이콘
- Edit 모드: 보드 타이틀, 메모 제목, 메모 note(클릭-투-에디트) 인라인 편집 — 디바운스되어 자동 저장
- 메모 카드 우상단 toolbar로 ⋮⋮ 드래그 / ↑↓ 한 칸 이동 / ✕ 삭제, 전체-카드 drop zone + 강한 drop indicator
- 대화 원문은 메모의 `messageUuids`로 필터링되어 현재 세션에서 추출, 읽기 전용 렌더
- 편집 내용이 **BroadcastChannel**(`memo-updates`)로 메인 앱 사이드 패널에 즉시 동기화

### Editor (cross-session 작성기)
- 상단 네비의 **`Editor`** 또는 `#/editor`
- **기본은 Edit 모드** (작성용 워크스페이스)
- `+ 메모 참조 추가` → 모달 picker에서 모든 세션의 메모를 평면 리스트로 검색(title / note / **대화 원문** 가중 매칭) → 다중 선택 후 `Add (N)`으로 한 번에 삽입
  - 항목 우측 `대화 N개 보기 ▾`로 인라인 펼쳐 실제 대화 확인 가능
  - 이미 추가한 메모는 잠금(disabled)
  - 숨긴 프로젝트의 메모는 picker에서 자동 제외
- 픽한 메모는 문서 블록으로 들어가며 **원본 메모는 변경되지 않음**(편집은 로컬 드래프트에만)
- 문서 제목 / 인트로 / 메타 DATE / 메모 블록(편집 가능 title / note + 원본 대화 + 출처) / footer — 다운로드 HTML과 시각적으로 동일
- 동일한 toolbar UX(드래그 / ↑↓ / ✕)
- **자동 동기화**: 페이지 새로고침 시 `api.listMemos()`로 각 블록의 `messageUuids`를 최신값으로 교체 (다른 곳에서 메모 범위가 편집된 경우 반영). 로컬 편집한 title / note는 항상 보존
- localStorage(`editor.draft.v1`) 자동 저장, Banner의 `✕` 아이콘으로 초기화(Clear)
- 상단 네비의 **`Editor`** 클릭 시 항상 새 draft (이미 /editor에 있어도 unique hash로 remount), F5/북마크/직접 URL은 작업 유지
- Download HTML / Copy MD (메모 사이드 패널 preview의 markdown export와 동일 포맷) / Preview 모드 토글

> Editor와 세션 메모 편집은 공유 React 컴포넌트(`MemoDoc.jsx` + `EditorMemoBlock.jsx`)를 사용해 항상 같은 룩&필 유지. **Markdown export**도 공유 렌더러(`src/lib/memoMarkdown.js`의 `renderMemoSection`)를 서버(`/api/sessions/:sid/memos/markdown`)와 클라이언트(`/editor` Copy MD)가 똑같이 사용해 같은 콘텐츠는 byte-identical 출력. 한 곳을 고치면 양쪽이 같이 반영됨.

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
- **빌드 산출물**: `./dist/` (`viewer.min.js` 포함 — Download HTML에 인라인됨)

## API

모든 라우트는 Fastify(5174) 에서 제공.

### 프로젝트 / 세션

| Method | Path |
|---|---|
| `GET` | `/api/projects` |
| `GET` | `/api/projects/:id/sessions` |
| `GET` | `/api/projects/:id/sessions/:sessionId` |
| `GET` | `/api/sessions/:sessionId/watch` (SSE) |

### 메모 (per-session)

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/sessions/:sessionId/memos` | 보드 전체 조회 (`title`, `memos[]`) |
| `PATCH` | `/api/sessions/:sessionId/memos` | 보드 타이틀 수정 (`{title}`) |
| `POST` | `/api/sessions/:sessionId/memos` | 메모 생성 |
| `PATCH` | `/api/sessions/:sessionId/memos/order` | 일괄 reorder (`{orderedIds: [...]}`) — single read+write로 atomic |
| `PATCH` | `/api/sessions/:sessionId/memos/:memoId` | 메모 수정 (`title`, `note`, `order`, `messageUuids`) |
| `DELETE` | `/api/sessions/:sessionId/memos/:memoId` | 메모 삭제 |

### 메모 (cross-session)

| Method | Path |
|---|---|
| `GET` | `/api/memos` |

### Export / Preview

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/sessions/:sessionId/memos/export` | 다운로드용 self-contained HTML |
| `GET` | `/api/sessions/:sessionId/memos/preview` | 라이브 HTML (edit 가능) — 레거시. 메인 편집은 in-app `#/sessions/:pid/:sid/edit` 라우트로 통합됨 |
| `GET` | `/api/sessions/:sessionId/memos/markdown` | Markdown 내보내기 |

### 검색

| Method | Path |
|---|---|
| `GET` | `/api/search?q=<text>&tool=<name>&from=<iso>&to=<iso>` |

## 워크플로

### 메모 만들기

1. 세션을 연 뒤 메시지 행을 **클릭**하면 선택, 여러 행 위로 **드래그**하면 일괄 선택 (행 내 드래그는 텍스트 복사로 동작)
2. **Shift+클릭**으로 범위 선택
3. 하단 플로팅 바의 **Add memo** → 제목(선택) + 노트(Markdown) 작성 후 Save
   - 제목 입력란에서 `Enter` → 즉시 저장, 노트 textarea에서 `Cmd/Ctrl+Enter` → 저장
4. 우측 **메모 패널**에 카드가 추가됨 — 드래그로 순서 변경, 클릭으로 원본 메시지로 점프, **Edit** (제목/노트) / **Edit Message** (메시지 소속) / **Delete**

### 메모 메시지 범위 편집

1. 메모 카드의 **Edit Message** 버튼 클릭 → 해당 메모가 파란 accent로 강조되고 소속 메시지들이 `.selected` 상태로 미리 채워짐
2. 다른 행 클릭으로 포함 추가, 이미 속한 행 클릭으로 제거, 드래그/Shift+클릭으로 일괄 토글
3. 하단 바의 **Save** 누르면 `messageUuids` 교체 커밋, **Cancel**은 원래대로 복구
4. 편집 중엔 다른 메모 카드의 Edit/Delete/Edit Message/재정렬이 잠김 (실수 방지)

### 공유

메모 패널 상단의 타이틀 입력란에 제목을 쓰고(비우면 "Claude Memos"), 하단 버튼으로:

- **Download HTML** — 단일 self-contained 파일 다운로드 (`claude-memos-<sid>-<date>.html`)
- **Preview & Edit** — 새 탭에서 in-app 편집 화면 오픈 (`#/sessions/:pid/:sid/edit`)
- **Copy as Markdown** — 클립보드에 복사 (위키/노션/Slack 등에 붙여넣기)

### 여러 세션의 메모를 한 문서로 묶기 (Editor)

1. 상단 네비 **`Editor`** 클릭 → `#/editor`
2. 문서 제목 / 인트로 작성
3. **`+ 메모 참조 추가`** → picker에서 검색(title / note / 대화 원문) → 다중 선택 후 `Add (N)`
4. 블록 순서 조정(드래그 또는 ↑↓), title / note 인라인 편집(원본 메모는 변경 없음)
5. **Download HTML** / **Copy MD** / **Preview** 토글
6. 작업 중 내용은 localStorage에 자동 저장

### Resume

세션 헤더의 **`resume`** 버튼 → 클립보드에 복사되는 명령어:

```bash
cd "<원본 cwd>" && claude --resume <sessionId>
```

터미널에 붙여넣으면 해당 세션으로 이어서 작업 시작.

## 구조

```
server/                       # Fastify 서버 (projects, sessions, memos, search, export, reorder)
src/lib/                      # 서버/클라이언트 공용 ESM
  parseMessages.js, formatTools.js, ...
  memoMarkdown.js             # ★ 메모 markdown 렌더러 (server/exportMarkdown + 클라이언트 Copy MD 공용)
  editorExport.js             # /editor의 HTML/Markdown 빌더 (memoMarkdown.js 호출)
src/state/                    # 클라이언트 스토어
  memoStore.js                # 세션 메모 (useSyncExternalStore)
  editorDraft.js              # /editor localStorage 드래프트
  sessionCache.js             # /api/projects/:id/sessions/:sid promise 캐시 + 동시성 큐
  hiddenProjects.js           # projectList.hidden.v1 read/write (공유 헬퍼)
src/components/
  MemoDoc.jsx                 # ★ /editor와 세션 메모 편집이 공유하는 문서 렌더러
  EditorMemoBlock.jsx         # ★ 메모 블록 (toolbar / drag / 클릭-투-에디트 / 대화 임베드)
  ReferencedConversation.jsx  # 메모의 messageUuids로 세션 메시지 필터링 + 렌더
  MemoReferencePicker.jsx     # /editor의 두레이-스타일 메모 참조 picker
  MemoPanel.jsx               # 세션 사이드 패널 (DraggableMemoList + ExportBar)
  ...
src/pages/
  EditorPage.jsx              # /editor — cross-session 작성기
  SessionMemoEditPage.jsx     # /sessions/:pid/:sid/edit — in-app 메모 편집
  SessionViewPage.jsx         # /p/:pid/s/:sid — 대화 + 사이드 패널
  ...
export-template/              # 다운로드 HTML 템플릿 + vanilla JS 렌더러 (viewer.js)
scripts/                      # viewer.js esbuild 번들 스크립트
data/memos/                   # 메모 JSON (런타임 생성, gitignored)
```

## 단축키

- `/` : 상단 검색창 포커스
- `Esc` : 모달 / 편집 textarea / 노트 편집 닫기
- 메시지 행 `Shift+클릭` : 범위 선택
- Add/Edit memo 모달 — 제목 입력 `Enter` : 저장 / textarea `Cmd(Ctrl)+Enter` : 저장
- 메모 참조 picker — 항목 클릭 또는 `Enter`/`Space` : 선택 토글, `Esc` : 닫기

## 라이선스

MIT. 자세한 내용은 [LICENSE](./LICENSE) 참고.
