# Jira import guide — 13 Dead End Drive (DED)

This folder contains CSV backlogs for importing into a Jira Cloud **Kanban** project with key **DED**.

| File | Rows | Purpose |
|------|------|---------|
| [`ded-jira-backlog-historical.csv`](ded-jira-backlog-historical.csv) | 39 | Phase 1–5 **Done** epics and stories (audit trail) |
| [`ded-jira-backlog-mvp.csv`](ded-jira-backlog-mvp.csv) | 57 | All 12 epics + **active MVP** and post-v1 backlog |

Import **historical first**, then **mvp**, so epic names exist before stories link to them.

---

## 1. Create the Jira project

1. **Jira → Create project → Kanban**.
2. Project name: **13 Dead End Drive**
3. Project key: **DED**
4. Note your site’s **issue type** names (e.g. `Epic`, `Story`, `Task`). CSV `Issue Type` must match exactly.

### Recommended Kanban columns

Map statuses during/after import:

| CSV Status | Kanban column |
|------------|----------------|
| Backlog | Backlog |
| Ready | Ready |
| To Do | Ready (or Backlog) |
| In Progress | In Progress |
| In Review | In Review |
| QA / UAT | *(add column)* or use **In Review** |
| Done | Done |

**WIP limits (Team Lead):** Ready ≤ 8 · In Progress ≤ 5 · In Review ≤ 3 · QA ≤ 5

---

## 2. Prepare Jira fields (before import)

Create these in **Project settings** if they do not exist globally.

### Components

| Name | Description |
|------|-------------|
| `engine` | `@ded/engine`, rules, `processTurn` |
| `network` | Colyseus, Supabase, `@ded/network` |
| `client` | React, 3D/2D, HUD, FX |
| `bot-ai` | `services/bot-ai`, orchestrator |
| `infra` | Docker, CI, deploy, env |
| `docs` | `.context/*`, SRS, play modes |

### Labels

`role:pm` · `role:ba` · `role:tl` · `role:dev` · `role:qa` · `mvp-v1` · `post-v1` · `done-legacy`

### Fix versions

| Version | Meaning |
|---------|---------|
| `v0.1-internal` | Shipped Phases 1–5 (historical) |
| `v1.0-mvp-beta` | **MVP public beta** (target) |
| `v1.1` | Post-MVP |

### Custom field (optional but recommended)

Add a text custom field **External ID** (e.g. `customfield_10xxx`) and map the CSV **External ID** column to it. This preserves stable ids like `DED-701` before Jira assigns `DED-123`.

---

## 3. Import order

### Step A — Historical backlog

1. **Jira settings → System → External imports → CSV** (or **Jira → Import** depending on plan).
2. Upload [`ded-jira-backlog-historical.csv`](ded-jira-backlog-historical.csv).
3. Map columns:

| CSV column | Jira field |
|------------|------------|
| Issue Type | Issue Type |
| External ID | External ID *(custom)* or Description prefix |
| Epic Link | Epic Link *(parent epic name)* |
| Summary | Summary |
| Description | Description |
| Priority | Priority |
| Status | Status |
| Labels | Labels |
| Components | Component/s |
| Fix Version/s | Fix Version/s |
| Story Points | Story Points *(if enabled)* |

4. Set **Project** = DED.
5. Run import. Confirm **39** issues created.

### Step B — MVP backlog

1. Import [`ded-jira-backlog-mvp.csv`](ded-jira-backlog-mvp.csv) the same way.
2. **Epic Link** must match epic **Summary** text (e.g. `DED-E07 Auth and production security`). Jira links child stories to epics by name on first import.
3. Confirm **57** issues (12 epics + 45 stories). Epics E01–E05 in this file are **pointers only**; detailed stories live in historical import.

### Step C — Verify epic links

1. Open **DED-E07** → **Child issues** should list DED-701–706.
2. If links are missing, bulk-edit stories and set **Parent** / **Epic Link** manually using External ID.

---

## 4. Board views (filters)

Create quick filters on the Kanban board:

| View name | JQL |
|-----------|-----|
| MVP active | `project = DED AND labels = mvp-v1 AND status != Done` |
| QA swimlane | `project = DED AND labels = role:qa` |
| Dev ready | `project = DED AND labels = role:dev AND status = Ready` |
| BA backlog | `project = DED AND labels = role:ba` |
| TL architecture | `project = DED AND (labels = role:tl OR component = infra)` |
| PM launch | `project = DED AND fixVersion = "v1.0-mvp-beta" AND labels = role:pm` |
| Post-v1 | `project = DED AND labels = post-v1` |

---

## 5. MVP v1 critical path (execution order)

1. **E06** — Finish DED-604, DED-605, DED-606, DED-607 (polish + docs + QA).
2. **E07** — Auth (DED-701–706) in parallel with BA/PM legal.
3. **E08** — Deploy staging (DED-801, 802, 804–806); DED-803 already Done.
4. **E09** — Full QA matrices on staging (DED-901–905); then 906–907; UAT DED-909.
5. **E11** — Beta launch (DED-1102 legal blocker, DED-1103 invite).

**Quality gates (Team Lead):**

```bash
npx vitest run --reporter=verbose   # 0 failures
npm run test:bot-ai
npm run lint:boundaries
```

Staging with `AUTH_REQUIRED=true` and real Supabase before UAT sign-off.

---

## 6. RACI (quick reference)

| Activity | PM | BA | TL | Full Stack | QA |
|----------|:--:|:--:|:--:|:----------:|:--:|
| Scope / MVP cut | A | R | C | I | C |
| Acceptance criteria | A | R | C | C | C |
| Architecture / RFC | I | C | A | R | I |
| Implementation | I | C | C | R | I |
| Playtest / UAT | A | C | I | I | R |
| Release sign-off | A | C | C | C | R |

*A = Accountable · R = Responsible · C = Consulted · I = Informed*

---

## 7. Troubleshooting import

| Problem | Fix |
|---------|-----|
| Epic Link not resolved | Import epics in a separate pass first; use exact Summary match |
| Unknown Issue Type `Epic` | Enable epics: **Project settings → Features → Epics** |
| Status not found | Add missing statuses in workflow or map CSV status in import wizard |
| Labels truncated | Import labels one per row or create labels in project before import |
| Duplicate External ID | Skip re-import; search `DED-701` in External ID field |

---

## 8. Source of truth in repo

Backlog content is derived from:

- [`.context/system_state.md`](../../.context/system_state.md) — phase status
- [`.context/play_modes.md`](../../.context/play_modes.md) — solo / local / online
- [`.context/board_rules_13_ded.md`](../../.context/board_rules_13_ded.md) — rules fidelity (DED-904)
- [`.cursor/plans/jira_kanban_backlog_9a1afb47.plan.md`](../../.cursor/plans/jira_kanban_backlog_9a1afb47.plan.md) — full epic/story catalog (do not edit for import; CSVs are the import artifacts)

---

*Generated 2026-06-01 · Project: 13 Dead End Drive · MVP target: v1.0-mvp-beta*
