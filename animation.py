from __future__ import annotations

import argparse
import json
from pathlib import Path

import minecrawl_solver as solver


def build_payload(date_text: str, click_interval_ms: int) -> dict:
    grid = solver.initialize_grid(date_text)
    selected = solver.best_closure(grid)
    plan = solver.schedule(grid, selected, 0, click_interval_ms / 1000)
    solver.validate_plan(grid, plan)

    steps = []
    total = 0.0
    mined: set[int] = set()
    children = solver.selected_children(selected)
    lookahead = solver.three_row_lookahead_values(grid, selected)

    for index, step in enumerate(plan, start=1):
        node = solver.node_id(step.row, step.col)
        unlocked = []
        mined.add(node)
        for child in children[node]:
            crow, ccol = solver.row_col(child)
            required = solver.parents(crow, ccol)
            if child not in mined and all(parent in mined for parent in required):
                unlocked.append(
                    {
                        "row": crow,
                        "col": ccol,
                        "value": grid[crow][ccol],
                    }
                )
        total += step.discounted_value
        steps.append(
            {
                "n": index,
                "row": step.row,
                "col": step.col,
                "value": step.value,
                "time": step.time,
                "discounted": step.discounted_value,
                "total": total,
                "lookahead": lookahead[node],
                "unlocked": unlocked[:6],
                "unlockCount": len(unlocked),
            }
        )

    return {
        "date": date_text,
        "rows": solver.ROWS,
        "cols": solver.COLS,
        "clickIntervalMs": click_interval_ms,
        "score": solver.score_plan(plan),
        "grid": grid,
        "steps": steps,
    }


def render_html(payload: dict) -> str:
    data = json.dumps(payload, separators=(",", ":"))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MineCrawl Greedy Animation</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101418;
      --panel: #1b2229;
      --line: #33404c;
      --text: #edf2f7;
      --muted: #9aa8b5;
      --gold: #f4b83e;
      --waste: #6fb7dd;
      --mined: #24313b;
      --green: #58d68d;
      --red: #ff6b6b;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 18px;
    }}
    main {{
      max-width: 1240px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(680px, 900px) 320px;
      gap: 18px;
      align-items: start;
    }}
    h1 {{
      grid-column: 1 / -1;
      margin: 0;
      font-size: 24px;
      letter-spacing: 0;
    }}
    .subtitle {{
      grid-column: 1 / -1;
      margin: -8px 0 4px;
      color: var(--muted);
      font-size: 14px;
    }}
    .board {{
      display: grid;
      grid-template-columns: repeat(30, 1fr);
      gap: 2px;
      width: 100%;
      aspect-ratio: 3 / 1;
      background: #0c1014;
      border: 1px solid var(--line);
      padding: 4px;
    }}
    .cell {{
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.12);
      font-size: 11px;
      font-weight: 700;
      color: #101418;
      transition: transform 140ms ease, opacity 140ms ease, outline 140ms ease;
    }}
    .cell.positive {{ background: var(--gold); }}
    .cell.negative {{ background: var(--waste); }}
    .cell.mined {{
      background: var(--mined);
      color: #667481;
      opacity: 0.58;
    }}
    .cell.current {{
      outline: 3px solid white;
      transform: scale(1.12);
      z-index: 3;
    }}
    .cell.unlocked {{
      outline: 2px solid var(--green);
    }}
    aside, .controls {{
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 14px;
    }}
    aside {{
      min-height: 500px;
    }}
    .controls {{
      margin-top: 12px;
      display: grid;
      grid-template-columns: auto auto 1fr;
      gap: 10px;
      align-items: center;
    }}
    button {{
      border: 1px solid var(--line);
      background: #25313b;
      color: var(--text);
      height: 36px;
      padding: 0 14px;
      cursor: pointer;
      font-weight: 700;
    }}
    button:hover {{ background: #30404d; }}
    input[type="range"] {{ width: 100%; }}
    .metric {{
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 8px;
      padding: 7px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-size: 14px;
    }}
    .metric span:first-child {{ color: var(--muted); }}
    .value.pos {{ color: var(--green); }}
    .value.neg {{ color: var(--red); }}
    .explain {{
      margin-top: 14px;
      line-height: 1.45;
      color: #dce6ef;
      font-size: 14px;
    }}
    .list {{
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }}
    @media (max-width: 980px) {{
      main {{ grid-template-columns: 1fr; }}
      .cell {{ font-size: 9px; }}
    }}
  </style>
</head>
<body>
<main>
  <h1>MineCrawl Greedy Solver Animation</h1>
  <p class="subtitle">Daily board: <strong id="date"></strong>. Each frame is one legal greedy click.</p>
  <section>
    <div id="board" class="board"></div>
    <div class="controls">
      <button id="play">Play</button>
      <button id="reset">Reset</button>
      <input id="slider" type="range" min="0" value="0">
    </div>
  </section>
  <aside>
    <div class="metric"><span>Step</span><strong id="step">0</strong></div>
    <div class="metric"><span>Block</span><strong id="block">-</strong></div>
    <div class="metric"><span>Raw value</span><strong id="raw" class="value">-</strong></div>
    <div class="metric"><span>Click time</span><strong id="time">-</strong></div>
    <div class="metric"><span>Discounted</span><strong id="discounted">-</strong></div>
    <div class="metric"><span>Total score</span><strong id="total">-</strong></div>
    <div class="metric"><span>3-row total</span><strong id="lookahead">-</strong></div>
    <p id="explain" class="explain"></p>
    <div id="unlocked" class="list"></div>
  </aside>
</main>
<script>
const payload = {data};
const board = document.querySelector('#board');
const cells = [];
let index = 0;
let playing = false;
let timer = null;

document.querySelector('#date').textContent = payload.date;
document.querySelector('#slider').max = payload.steps.length;

for (let r = 0; r < payload.rows; r++) {{
  for (let c = 0; c < payload.cols; c++) {{
    const value = payload.grid[r][c];
    const cell = document.createElement('div');
    cell.className = 'cell ' + (value >= 0 ? 'positive' : 'negative');
    cell.textContent = value;
    cell.dataset.row = r;
    cell.dataset.col = c;
    board.appendChild(cell);
    cells.push(cell);
  }}
}}

function cellAt(row, col) {{
  return cells[row * payload.cols + col];
}}

function money(value) {{
  return '$' + value.toFixed(2);
}}

function explain(step) {{
  if (!step) {{
    return 'Press Play to watch the greedy solver mine the board. Gold blocks add value; blue waste blocks cost money but can unlock deeper value.';
  }}
  if (step.value < 0) {{
    return `Greedy accepts this waste cost because the three rows beneath it have a nearby net value of ${{step.lookahead}}. It is paying a small entry cost when the local cone still looks worthwhile.`;
  }}
  if (step.unlockCount > 0) {{
    return 'This positive block is mined now because it scores well immediately and also unlocks more legal choices below.';
  }}
  return 'This block is currently the best legal choice by immediate discounted value and downstream urgency.';
}}

function render(target) {{
  index = Number(target);
  cells.forEach(cell => {{
    cell.classList.remove('mined', 'current', 'unlocked');
  }});
  for (let i = 0; i < index; i++) {{
    const step = payload.steps[i];
    cellAt(step.row, step.col).classList.add('mined');
  }}
  const current = payload.steps[index - 1];
  if (current) {{
    const currentCell = cellAt(current.row, current.col);
    currentCell.classList.add('current');
    current.unlocked.forEach(item => cellAt(item.row, item.col).classList.add('unlocked'));
  }}

  document.querySelector('#slider').value = index;
  document.querySelector('#step').textContent = `${{index}} / ${{payload.steps.length}}`;
  document.querySelector('#block').textContent = current ? `row ${{current.row + 1}}, col ${{current.col + 1}}` : '-';
  const raw = document.querySelector('#raw');
  raw.textContent = current ? current.value : '-';
  raw.className = 'value ' + (current && current.value >= 0 ? 'pos' : 'neg');
  document.querySelector('#time').textContent = current ? current.time.toFixed(3) + 's' : '-';
  document.querySelector('#discounted').textContent = current ? money(current.discounted) : '-';
  document.querySelector('#total').textContent = current ? money(current.total) : '$0.00';
  document.querySelector('#lookahead').textContent = current ? current.lookahead : '-';
  document.querySelector('#explain').textContent = explain(current);
  document.querySelector('#unlocked').textContent = current && current.unlockCount
    ? `Unlocked ${{current.unlockCount}} block(s). Green outline shows up to six newly legal choices.`
    : '';
}}

function tick() {{
  if (index >= payload.steps.length) {{
    playing = false;
    document.querySelector('#play').textContent = 'Play';
    return;
  }}
  render(index + 1);
  timer = setTimeout(tick, 180);
}}

document.querySelector('#play').addEventListener('click', () => {{
  playing = !playing;
  document.querySelector('#play').textContent = playing ? 'Pause' : 'Play';
  if (playing) tick();
  else clearTimeout(timer);
}});

document.querySelector('#reset').addEventListener('click', () => {{
  playing = false;
  clearTimeout(timer);
  document.querySelector('#play').textContent = 'Play';
  render(0);
}});

document.querySelector('#slider').addEventListener('input', event => {{
  playing = false;
  clearTimeout(timer);
  document.querySelector('#play').textContent = 'Play';
  render(event.target.value);
}});

render(0);
</script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an animated greedy explanation page.")
    parser.add_argument("--date", default=solver.perth_today())
    parser.add_argument("--click-interval-ms", type=int, default=solver.DEFAULT_CLICK_INTERVAL_MS)
    parser.add_argument("--output", default="greedy_animation.html")
    args = parser.parse_args()

    payload = build_payload(args.date, args.click_interval_ms)
    output = Path(args.output)
    output.write_text(render_html(payload), encoding="utf-8")
    print(f"Wrote {output.resolve()}")
    print(f"Steps: {len(payload['steps'])}")
    print(f"Expected score: ${payload['score']:.2f}")


if __name__ == "__main__":
    main()
