from __future__ import annotations

import argparse
import datetime as dt
import json
import math
from collections import deque
from dataclasses import dataclass


COLS = 30
ROWS = 10
BLOCK_SIZE = 30
THROTTLE_INTERVAL_SECONDS = 1 / 3
DEFAULT_CLICK_INTERVAL_MS = 335
TIME_LIMIT_SECONDS = 90


class DailyRandom:
    """Match the JavaScript seeded PRNG used by minecrawl.netlify.app/game.js."""

    def __init__(self, date_text: str):
        seed = 0
        for ch in date_text:
            seed = self._to_int32(math.imul(31, seed) + ord(ch))
        self.seed = seed

    @staticmethod
    def _to_uint32(value: int) -> int:
        return value & 0xFFFFFFFF

    @staticmethod
    def _to_int32(value: int) -> int:
        value &= 0xFFFFFFFF
        return value - 0x100000000 if value & 0x80000000 else value

    @staticmethod
    def _imul(a: int, b: int) -> int:
        return DailyRandom._to_int32((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF))

    def random(self) -> float:
        self.seed = self._to_int32(self.seed + 0x6D2B79F5)
        t = self.seed
        t = self._imul(t ^ (self._to_uint32(t) >> 15), t | 1)
        t = self._to_int32(
            t
            ^ self._to_int32(
                t + self._imul(t ^ (self._to_uint32(t) >> 7), t | 61)
            )
        )
        return self._to_uint32(t ^ (self._to_uint32(t) >> 14)) / 4294967296

    def random_int(self, min_value: int, max_value: int) -> int:
        return math.floor(self.random() * (max_value - min_value) + min_value)


# Python lacks Math.imul; keep the call site readable.
math.imul = DailyRandom._imul  # type: ignore[attr-defined]


def perth_today() -> str:
    return (
        dt.datetime.now(dt.UTC).astimezone(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    )


def initialize_grid(date_text: str) -> list[list[int]]:
    rng = DailyRandom(date_text)
    grid = [[0 for _ in range(COLS)] for _ in range(ROWS)]
    top_rows = math.floor(ROWS * 0.3)

    for row in range(top_rows):
        for col in range(COLS):
            if rng.random() < 0.3:
                grid[row][col] = rng.random_int(5, 15)

    mid_start_row = top_rows
    mid_end_row = math.floor(ROWS * 0.8)

    for _ in range(15):
        cluster_row = rng.random_int(mid_start_row, mid_end_row)
        cluster_col = rng.random_int(math.floor(COLS / 5), math.floor(4 * COLS / 5))
        cluster_size = rng.random_int(3, 6)
        cluster_radius = rng.random_int(1, 3)

        for _ in range(cluster_size):
            offset_row = rng.random_int(-cluster_radius, cluster_radius + 1)
            offset_col = rng.random_int(-cluster_radius, cluster_radius + 1)
            r = max(0, min(cluster_row + offset_row, ROWS - 1))
            c = max(0, min(cluster_col + offset_col, COLS - 1))
            if rng.random() < 0.6:
                grid[r][c] = rng.random_int(20, 60)

    bottom_start_row = math.floor(ROWS * 0.7)

    for row in range(bottom_start_row, ROWS):
        for col in range(COLS):
            if rng.random() < 0.3:
                if rng.random() < 0.2:
                    grid[row][col] = rng.random_int(150, 200)
                else:
                    grid[row][col] = rng.random_int(20, 30)

    for row in range(ROWS):
        min_val = -1.5 * math.pow(1.25, row)
        max_val = -1.5 * math.pow(1.25, row + 1)
        waste_value = math.floor(rng.random() * (max_val - min_val) + min_val)
        for col in range(COLS):
            if grid[row][col] == 0:
                grid[row][col] = waste_value

    return grid


def node_id(row: int, col: int) -> int:
    return row * COLS + col


def row_col(node: int) -> tuple[int, int]:
    return divmod(node, COLS)


def parents(row: int, col: int) -> list[int]:
    if row == 0:
        return []
    if col == 0 or col == COLS - 1:
        return [-1]  # JS edge behavior makes these unmineable below row 0.
    return [
        node_id(row - 1, col - 1),
        node_id(row - 1, col),
        node_id(row - 1, col + 1),
    ]


class Dinic:
    def __init__(self, n: int):
        self.graph: list[list[list[int | float]]] = [[] for _ in range(n)]

    def add_edge(self, fr: int, to: int, cap: float) -> None:
        forward = [to, len(self.graph[to]), cap]
        backward = [fr, len(self.graph[fr]), 0.0]
        self.graph[fr].append(forward)
        self.graph[to].append(backward)

    def max_flow(self, source: int, sink: int) -> float:
        flow = 0.0
        n = len(self.graph)
        while True:
            level = [-1] * n
            level[source] = 0
            q = deque([source])
            while q:
                v = q.popleft()
                for edge in self.graph[v]:
                    if edge[2] > 1e-9 and level[edge[0]] < 0:
                        level[edge[0]] = level[v] + 1
                        q.append(edge[0])
            if level[sink] < 0:
                break
            it = [0] * n

            def dfs(v: int, f: float) -> float:
                if v == sink:
                    return f
                for i in range(it[v], len(self.graph[v])):
                    it[v] = i
                    edge = self.graph[v][i]
                    if edge[2] > 1e-9 and level[v] < level[edge[0]]:
                        d = dfs(edge[0], min(f, edge[2]))
                        if d > 1e-9:
                            edge[2] -= d
                            self.graph[edge[0]][edge[1]][2] += d
                            return d
                return 0.0

            while True:
                pushed = dfs(source, float("inf"))
                if pushed <= 1e-9:
                    break
                flow += pushed
        return flow

    def reachable_from(self, source: int) -> set[int]:
        seen = {source}
        q = deque([source])
        while q:
            v = q.popleft()
            for edge in self.graph[v]:
                if edge[2] > 1e-9 and edge[0] not in seen:
                    seen.add(edge[0])
                    q.append(edge[0])
        return seen


def best_closure(grid: list[list[int]]) -> set[int]:
    source = ROWS * COLS
    sink = source + 1
    dinic = Dinic(sink + 1)
    inf = 1_000_000.0

    for row in range(ROWS):
        for col in range(COLS):
            nid = node_id(row, col)
            value = grid[row][col]
            if value > 0:
                dinic.add_edge(source, nid, value)
            else:
                dinic.add_edge(nid, sink, -value)
            for parent in parents(row, col):
                if parent >= 0:
                    dinic.add_edge(nid, parent, inf)
                else:
                    dinic.add_edge(nid, sink, inf)

    dinic.max_flow(source, sink)
    reachable = dinic.reachable_from(source)
    return {n for n in range(ROWS * COLS) if n in reachable}


@dataclass(frozen=True)
class Step:
    row: int
    col: int
    value: int
    time: float
    discounted_value: float

    @property
    def x(self) -> int:
        return self.col * BLOCK_SIZE + BLOCK_SIZE // 2

    @property
    def y(self) -> int:
        return self.row * BLOCK_SIZE + BLOCK_SIZE // 2


def selected_children(selected: set[int]) -> dict[int, set[int]]:
    children = {n: set() for n in selected}
    for node in selected:
        row, col = row_col(node)
        for parent in parents(row, col):
            if parent in selected:
                children[parent].add(node)
    return children


def schedule(
    grid: list[list[int]],
    selected: set[int],
    elapsed_seconds: float = 0.0,
    click_interval_seconds: float = DEFAULT_CLICK_INTERVAL_MS / 1000,
) -> list[Step]:
    remaining_clicks = max(
        0,
        int((TIME_LIMIT_SECONDS - elapsed_seconds) / click_interval_seconds),
    )
    children = selected_children(selected)
    remaining_parents = {}
    for node in selected:
        row, col = row_col(node)
        remaining_parents[node] = sum(1 for p in parents(row, col) if p in selected)

    lookahead_values = three_row_lookahead_values(grid, selected)

    available = {n for n, count in remaining_parents.items() if count == 0}
    mined: set[int] = set()
    plan: list[Step] = []

    while available and len(plan) < remaining_clicks:
        elapsed = elapsed_seconds + len(plan) * click_interval_seconds

        def priority(node: int) -> tuple[float, int, int]:
            row, col = row_col(node)
            value = grid[row][col]
            local_grade = lookahead_values[node]
            unlocks = sum(1 for child in children[node] if child not in mined)
            local_grade_priority = local_grade / (row + 1)
            immediate = value / math.pow(1.01, elapsed)
            return (immediate + local_grade_priority + 0.25 * unlocks, local_grade, value)

        node = max(available, key=priority)
        available.remove(node)
        mined.add(node)
        row, col = row_col(node)
        value = grid[row][col]
        discounted = value / math.pow(1.01, elapsed)
        plan.append(Step(row, col, value, elapsed, discounted))

        for child in children[node]:
            remaining_parents[child] -= 1
            if remaining_parents[child] == 0 and child not in mined:
                available.add(child)

    while plan and plan[-1].value < 0:
        plan.pop()
    return plan


def descendant_values(
    grid: list[list[int]], selected: set[int], children: dict[int, set[int]]
) -> dict[int, int]:
    values: dict[int, int] = {}
    for node in sorted(selected, reverse=True):
        row, col = row_col(node)
        best = max(grid[row][col], 0)
        for child in children[node]:
            best = max(best, values.get(child, 0))
        values[node] = best
    return values


def three_row_lookahead_values(grid: list[list[int]], selected: set[int]) -> dict[int, int]:
    values: dict[int, int] = {}
    for node in selected:
        row, col = row_col(node)
        score = 0
        for depth in range(1, 4):
            target_row = row + depth
            if target_row >= ROWS:
                break
            left = max(1, col - depth)
            right = min(COLS - 2, col + depth)
            for target_col in range(left, right + 1):
                target_node = node_id(target_row, target_col)
                if target_node in selected:
                    score += grid[target_row][target_col]
        values[node] = score
    return values


def steps_from_nodes(
    grid: list[list[int]],
    nodes: tuple[int, ...],
    elapsed_seconds: float,
    click_interval_seconds: float,
) -> list[Step]:
    plan = []
    for index, node in enumerate(nodes):
        row, col = row_col(node)
        elapsed = elapsed_seconds + index * click_interval_seconds
        value = grid[row][col]
        plan.append(Step(row, col, value, elapsed, value / math.pow(1.01, elapsed)))
    return plan


def beam_schedule(
    grid: list[list[int]],
    selected: set[int],
    elapsed_seconds: float = 0.0,
    beam_width: int = 3000,
    branch_limit: int = 10,
    click_interval_seconds: float = DEFAULT_CLICK_INTERVAL_MS / 1000,
) -> list[Step]:
    remaining_clicks = max(
        0,
        int((TIME_LIMIT_SECONDS - elapsed_seconds) / click_interval_seconds),
    )
    selected_nodes = sorted(selected)
    selected_mask = sum(1 << node for node in selected_nodes)
    values = {node: grid[row_col(node)[0]][row_col(node)[1]] for node in selected_nodes}
    parent_masks = {}
    for node in selected_nodes:
        row, col = row_col(node)
        parent_masks[node] = sum(1 << parent for parent in parents(row, col) if parent in selected)

    children = selected_children(selected)
    lookahead_values = three_row_lookahead_values(grid, selected)

    def available_nodes(mined_mask: int) -> list[int]:
        return [
            node
            for node in selected_nodes
            if not (mined_mask & (1 << node))
            and (parent_masks[node] & ~mined_mask) == 0
        ]

    def candidate_priority(node: int, mined_mask: int, elapsed: float) -> tuple[float, int, int]:
        value = values[node]
        unlocks = sum(1 for child in children[node] if not (mined_mask & (1 << child)))
        immediate = value / math.pow(1.01, elapsed)
        return (
            immediate + lookahead_values[node] + 0.25 * unlocks,
            lookahead_values[node],
            value,
        )

    def optimistic_rank(score: float, mined_mask: int, depth: int) -> float:
        slots = remaining_clicks - depth
        if slots <= 0:
            return score
        positives = sorted(
            (value for node, value in values.items() if value > 0 and not (mined_mask & (1 << node))),
            reverse=True,
        )
        future = 0.0
        for offset, value in enumerate(positives[:slots]):
            elapsed = elapsed_seconds + (depth + offset) * click_interval_seconds
            future += value / math.pow(1.01, elapsed)
        return score + future;

    # (actual_score, mined_mask, node_plan)
    beam: list[tuple[float, int, tuple[int, ...]]] = [(0.0, 0, ())]
    best_score = 0.0
    best_plan: tuple[int, ...] = ()

    for depth in range(remaining_clicks):
        next_by_mask: dict[int, tuple[float, int, tuple[int, ...]]] = {}
        any_extended = False
        for score, mined_mask, node_plan in beam:
            elapsed = elapsed_seconds + depth * click_interval_seconds
            candidates = available_nodes(mined_mask)
            if not candidates:
                continue
            candidates.sort(
                key=lambda node: candidate_priority(node, mined_mask, elapsed),
                reverse=True,
            )
            for node in candidates[:branch_limit]:
                any_extended = True
                next_mask = mined_mask | (1 << node)
                next_score = score + values[node] / math.pow(1.01, elapsed)
                next_plan = node_plan + (node,)
                current = next_by_mask.get(next_mask)
                if current is None or next_score > current[0]:
                    next_by_mask[next_mask] = (next_score, next_mask, next_plan)
                if next_score > best_score:
                    best_score = next_score
                    best_plan = next_plan

        if not any_extended:
            break

        next_states = list(next_by_mask.values())
        next_states.sort(
            key=lambda state: optimistic_rank(state[0], state[1], len(state[2])),
            reverse=True,
        )
        beam = next_states[:beam_width]

        if beam and all(state[1] == selected_mask for state in beam):
            break

    return steps_from_nodes(grid, best_plan, elapsed_seconds, click_interval_seconds)


def score_plan(plan: list[Step]) -> float:
    return sum(step.discounted_value for step in plan)


def validate_plan(grid: list[list[int]], plan: list[Step]) -> None:
    simulated = [row[:] for row in grid]
    for index, step in enumerate(plan, start=1):
        if simulated[step.row][step.col] == 0:
            raise ValueError(f"Click {index} targets an already-mined block: {step}")
        if step.row > 0:
            needed = parents(step.row, step.col)
            if any(parent < 0 for parent in needed):
                raise ValueError(f"Click {index} targets an unmineable edge block: {step}")
            blocked = [row_col(parent) for parent in needed if simulated[row_col(parent)[0]][row_col(parent)[1]] != 0]
            if blocked:
                raise ValueError(f"Click {index} is blocked by unmined parents {blocked}: {step}")
        simulated[step.row][step.col] = 0


def js_autoplayer(
    plan: list[Step], name: str, already_started: bool, click_interval_ms: int
) -> str:
    coords = [{"x": step.x, "y": step.y} for step in plan]
    start_lines = (
        "document.querySelector('#playerNameInput').value = playerName;\n"
        "document.querySelector('#startGameBtn').click();"
        if not already_started
        else "// Game is assumed to already be running."
    )
    return f"""// Paste into the MineCrawl browser console while on https://minecrawl.netlify.app/
const playerName = {json.dumps(name)};
const clicks = {json.dumps(coords, separators=(",", ":"))};
{start_lines}
const canvas = document.querySelector('#gameCanvas');
const rect = () => canvas.getBoundingClientRect();
clicks.forEach((p, i) => {{
  setTimeout(() => {{
    const r = rect();
    canvas.dispatchEvent(new MouseEvent('click', {{
      bubbles: true,
      clientX: r.left + p.x,
      clientY: r.top + p.y
    }}));
  }}, i * {click_interval_ms});
}});
"""


def print_grid(grid: list[list[int]]) -> None:
    for row in grid:
        print(" ".join(f"{value:4d}" for value in row))


def main() -> None:
    parser = argparse.ArgumentParser(description="Solve the daily MineCrawl board.")
    parser.add_argument("--date", default=perth_today(), help="Perth date, YYYY-MM-DD")
    parser.add_argument("--name", default="Codex", help="Player name for JS snippet")
    parser.add_argument(
        "--elapsed-seconds",
        type=float,
        default=0.0,
        help="Seconds already elapsed since the game timer started",
    )
    parser.add_argument(
        "--already-started",
        action="store_true",
        help="Generate JS for a game that is already running",
    )
    parser.add_argument(
        "--algorithm",
        choices=["greedy", "beam"],
        default="beam",
        help="Click-order optimizer to use",
    )
    parser.add_argument("--beam-width", type=int, default=3000)
    parser.add_argument("--branch-limit", type=int, default=10)
    parser.add_argument(
        "--click-interval-ms",
        type=int,
        default=DEFAULT_CLICK_INTERVAL_MS,
        help="Autoplayer spacing. Must be safely above the game's 333 ms throttle.",
    )
    parser.add_argument("--json", action="store_true", help="Print click plan as JSON")
    parser.add_argument("--show-grid", action="store_true", help="Print generated grid")
    args = parser.parse_args()
    if args.click_interval_ms <= 333:
        parser.error("--click-interval-ms must be greater than 333")

    grid = initialize_grid(args.date)
    selected = best_closure(grid)
    click_interval_seconds = args.click_interval_ms / 1000
    if args.algorithm == "greedy":
        plan = schedule(grid, selected, args.elapsed_seconds, click_interval_seconds)
    else:
        plan = beam_schedule(
            grid,
            selected,
            args.elapsed_seconds,
            args.beam_width,
            args.branch_limit,
            click_interval_seconds,
        )
    validate_plan(grid, plan)

    if args.show_grid:
        print_grid(grid)
        print()

    print(f"Date: {args.date}")
    print(f"Elapsed seconds before first click: {args.elapsed_seconds:.2f}")
    print(f"Algorithm: {args.algorithm}")
    print(f"Click interval: {args.click_interval_ms} ms")
    print(f"Selected blocks: {len(selected)}")
    print(f"Planned clicks: {len(plan)}")
    print(f"Expected displayed score before rounding: ${score_plan(plan):.2f}")
    print()

    if args.json:
        print(json.dumps([step.__dict__ | {"x": step.x, "y": step.y} for step in plan], indent=2))
    else:
        print(js_autoplayer(plan, args.name, args.already_started, args.click_interval_ms))


if __name__ == "__main__":
    main()
