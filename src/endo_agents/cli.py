"""Command-line entrypoint: `endo <command>`."""

from __future__ import annotations

import secrets
import shutil
import time
from datetime import datetime
from urllib.parse import parse_qs, urlparse

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .config import SECRET_NAMES, MissingSecret
from .context import Ctx, make_ctx
from .db import VideoStatus, loads

app = typer.Typer(add_completion=False, no_args_is_help=True, help="Endogenism → Reels & TikTok, fully automated.")
console = Console()

AGENT_COLORS = {
    "ingest": "cyan",
    "planner": "blue",
    "writer": "green",
    "critic": "magenta",
    "voice": "yellow",
    "visual": "bright_cyan",
    "render": "bright_blue",
    "qa": "bright_magenta",
    "upload": "white",
    "publisher": "bright_green",
    "analytics": "bright_yellow",
}


def _ctx() -> Ctx:
    return make_ctx()


def _llm(ctx: Ctx):
    from .llm import LLM

    return LLM(ctx.settings)


def _local(ctx: Ctx, iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(ctx.settings.tz).strftime("%a %d/%m %H:%M")


def _guard(fn):
    """Turn configuration errors into a friendly message instead of a traceback."""
    from functools import wraps

    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except MissingSecret as exc:
            console.print(f"[red]✗ {exc}[/red]")
            raise typer.Exit(2) from exc

    return wrapper


@app.command()
def doctor() -> None:
    """Check secrets, tools and content before running."""
    ctx = _ctx()
    s = ctx.settings
    table = Table(title="endo doctor", show_lines=False)
    table.add_column("Hạng mục")
    table.add_column("Trạng thái")
    for name in SECRET_NAMES:
        optional = name.startswith("TELEGRAM")
        ok = bool(s.env.get(name))
        table.add_row(
            name, "[green]✓[/green]" if ok else ("[yellow]– (tuỳ chọn)[/yellow]" if optional else "[red]✗ thiếu[/red]")
        )
    for binary in ("node", "npx", "ffmpeg", "ffprobe"):
        table.add_row(f"bin: {binary}", "[green]✓[/green]" if shutil.which(binary) else "[red]✗ chưa cài[/red]")
    remotion_ok = (s.path("remotion_dir") / "node_modules").exists()
    table.add_row(
        "remotion/node_modules", "[green]✓[/green]" if remotion_ok else "[red]✗ chạy npm install trong remotion/[/red]"
    )
    music = list(s.path("music_dir").rglob("*.mp3"))
    table.add_row(
        "Nhạc nền", f"[green]{len(music)} bài[/green]" if music else "[yellow]0 bài (video sẽ không có nhạc)[/yellow]"
    )
    from .content import load_articles

    table.add_row("Bài viết", f"{len(load_articles(s.path('content_dir')))} bài")
    ideas = ctx.db.one("SELECT COUNT(*) AS n FROM ideas")["n"]
    table.add_row("Kho ý tưởng", f"{ideas} ý tưởng" if ideas else "[yellow]trống — chạy endo ingest[/yellow]")
    table.add_row(
        "TikTok OAuth",
        "[green]✓[/green]" if ctx.db.get_kv("tiktok_tokens") else "[yellow]chưa — chạy endo tiktok-auth[/yellow]",
    )
    table.add_row(
        "Chế độ đăng", "[yellow]DRY RUN (không đăng thật)[/yellow]" if s.publish.dry_run else "[green]LIVE[/green]"
    )
    table.add_row("TikTok mode", s.publish.tiktok_mode)
    table.add_row("Tạm dừng", "[red]CÓ[/red]" if ctx.db.get_kv("paused") else "không")
    console.print(table)


@app.command()
@_guard
def ingest(
    force: bool = typer.Option(False, help="Re-ingest even if the article is unchanged."),
    limit: int = typer.Option(None, help="Max number of articles to process."),
    article: str = typer.Option(None, help="Only this article id, e.g. bai-001."),
) -> None:
    """Split articles into video ideas (runs once; re-runs only changed articles)."""
    from .agents import ingest as agent

    ctx = _ctx()
    agent.run(ctx, _llm(ctx), force=force, limit=limit, only=article)


@app.command()
def plan() -> None:
    """Fill the next N days of posting slots."""
    from .agents import planner

    planner.run(_ctx())


@app.command()
@_guard
def produce(
    limit: int = typer.Option(None, help="Process at most N videos."),
    video: list[int] = typer.Option(None, "--video", "-v", help="Only these video ids."),
) -> None:
    """Write → critique → voice → render → QA → queue."""
    from .pipeline import produce as run_produce

    ctx = _ctx()
    stats = run_produce(ctx, _llm(ctx), limit=limit, video_ids=video or None)
    console.print(stats)


@app.command()
@_guard
def daily() -> None:
    """Cron job: plan the week and produce everything needed."""
    from .agents import planner
    from .pipeline import produce as run_produce
    from .pipeline import single_instance

    ctx = _ctx()
    with single_instance(ctx, "daily") as acquired:
        if not acquired:
            console.print("[yellow]daily đang chạy ở tiến trình khác — bỏ qua.[/yellow]")
            return
        planner.run(ctx)
        run_produce(ctx, _llm(ctx))


@app.command()
@_guard
def publish() -> None:
    """Cron job (every 5 min): post videos whose slot time has arrived."""
    from .agents import publisher
    from .pipeline import single_instance

    ctx = _ctx()
    with single_instance(ctx, "publish") as acquired:
        if acquired:
            publisher.run(ctx)


@app.command()
@_guard
def analytics() -> None:
    """Cron job: collect 24h/72h metrics and update learning weights."""
    from .agents import analytics as agent
    from .pipeline import single_instance

    ctx = _ctx()
    with single_instance(ctx, "analytics") as acquired:
        if acquired:
            agent.collect(ctx)


@app.command()
def report(send: bool = typer.Option(True, help="Also send to Telegram.")) -> None:
    """Weekly report (read-only)."""
    from .agents import analytics as agent

    console.print(Panel(agent.weekly_report(_ctx(), send=send)))


@app.command()
def status() -> None:
    """Pipeline overview and the upcoming queue."""
    ctx = _ctx()
    counts = {r["status"]: r["n"] for r in ctx.db.all("SELECT status, COUNT(*) AS n FROM videos GROUP BY status")}
    t = Table(title="Trạng thái video")
    for st in VideoStatus:
        t.add_column(st.value, justify="right")
    t.add_row(*[str(counts.get(st.value, 0)) for st in VideoStatus])
    console.print(t)

    ideas = {r["status"]: r["n"] for r in ctx.db.all("SELECT status, COUNT(*) AS n FROM ideas GROUP BY status")}
    console.print(
        f"Kho ý tưởng: {ideas.get('available', 0)} còn · {ideas.get('used', 0)} đã dùng · {ideas.get('skipped', 0)} bị loại"
    )

    upcoming = ctx.db.all(
        """SELECT v.id, v.slot_at, v.format, v.episode, v.status, v.article_id, v.script, v.critic
           FROM videos v WHERE v.status NOT IN ('published', 'measured', 'failed') ORDER BY v.slot_at LIMIT 15"""
    )
    q = Table(title="Sắp tới")
    for col in ("#", "Giờ đăng", "Format", "Trạng thái", "Bài", "Điểm", "Hook"):
        q.add_column(col)
    for v in upcoming:
        script, review = loads(v["script"], {}), loads(v["critic"], {})
        hook = script.get("final_beats", [{}])[0].get("text", "") if script.get("final_beats") else ""
        q.add_row(
            str(v["id"]),
            _local(ctx, v["slot_at"]),
            f"{v['format']} #{v['episode']}",
            v["status"],
            v["article_id"],
            str(review.get("total", "")),
            hook[:60],
        )
    console.print(q)
    if ctx.db.get_kv("paused"):
        console.print("[red]⏸  Đăng bài đang TẠM DỪNG[/red]")


@app.command()
def show(video_id: int) -> None:
    """Everything about one video: script, critic scores, media, publications, timeline."""
    ctx = _ctx()
    v = ctx.db.video(video_id)
    script, review, media = loads(v["script"], {}), loads(v["critic"], {}), loads(v["media"], {})
    console.print(
        Panel(
            f"{v['format']} #{v['episode']} · {_local(ctx, v['slot_at'])} · {v['article_id']} · [bold]{v['status']}[/bold]"
            + (f"\n[red]{v['error']}[/red]" if v["error"] else ""),
            title=f"Video #{video_id}",
        )
    )
    if script:
        for h in script.get("hooks", []):
            console.print(f"  hook [{h['style']}] {h['text']}")
        console.print()
        for b in script.get("final_beats") or script.get("beats", []):
            console.print(f"  [bold]{b['role']:>8}[/bold]  {b['text']}")
        console.print(f"\n  caption: {script.get('caption')}\n  tags: {' '.join(script.get('hashtags', []))}")
    if review:
        console.print(f"\nCritic vòng {review.get('round')}: tổng {review.get('total')} · {review.get('scores')}")
        for f in review.get("violations", []) + review.get("feedback", []):
            console.print(f"  - {f}")
    if media.get("video"):
        console.print(f"\nVideo: {ctx.settings.data_dir / 'media' / f'{video_id:05d}' / media['video']}")
    for p in ctx.db.all("SELECT * FROM publications WHERE video_id = ?", video_id):
        console.print(f"{p['platform']}: {p['status']} {p['permalink'] or ''} {p['error'] or ''}")
    console.print("\nDòng thời gian:")
    for e in ctx.db.all("SELECT * FROM events WHERE video_id = ? ORDER BY id", video_id):
        color = AGENT_COLORS.get(e["agent"], "white")
        console.print(f"  {_local(ctx, e['ts'])} [{color}]{e['agent']:>9}[/{color}] {e['message']}")


def _print_event(ctx: Ctx, e) -> None:
    color = AGENT_COLORS.get(e["agent"], "white")
    vid = f"#{e['video_id']:<4}" if e["video_id"] else "     "
    ts = datetime.fromisoformat(e["ts"]).astimezone(ctx.settings.tz).strftime("%H:%M:%S")
    msg = e["message"]
    if e["level"] in ("error", "warning"):
        tone = "red" if e["level"] == "error" else "yellow"
        msg = f"[{tone}]{msg}[/{tone}]"
    console.print(f"[dim]{ts}[/dim] [{color}]{e['agent']:>9}[/{color}] {vid} {msg}", highlight=False)


@app.command()
def watch(history: int = typer.Option(20, help="Show the last N events first.")) -> None:
    """Live feed of what every agent is doing (great for demos)."""
    ctx = _ctx()
    rows = list(reversed(ctx.db.all("SELECT * FROM events ORDER BY id DESC LIMIT ?", history)))
    last = 0
    try:
        while True:
            for e in rows:
                _print_event(ctx, e)
                last = e["id"]
            time.sleep(1)
            rows = ctx.db.all("SELECT * FROM events WHERE id > ? ORDER BY id", last)
    except KeyboardInterrupt:
        pass


@app.command()
def pause() -> None:
    """Emergency stop: no more posts until `endo resume`."""
    ctx = _ctx()
    ctx.db.set_kv("paused", True)
    ctx.event("publisher", "⏸  TẠM DỪNG đăng bài", level="warning")


@app.command()
def resume() -> None:
    """Resume posting."""
    ctx = _ctx()
    ctx.db.set_kv("paused", False)
    ctx.event("publisher", "▶  Tiếp tục đăng bài")


@app.command("tiktok-auth")
@_guard
def tiktok_auth() -> None:
    """One-time TikTok OAuth: open the link, approve, paste the redirect URL back here."""
    from .integrations.tiktok import TikTok

    ctx = _ctx()
    tt = TikTok(ctx.settings, ctx.db)
    state = secrets.token_urlsafe(16)
    console.print(Panel(tt.authorize_url(state), title="1. Mở link này, đăng nhập TikTok và bấm Cho phép"))
    pasted = typer.prompt("2. Dán URL trình duyệt chuyển tới (hoặc chỉ mã code)").strip()
    if pasted.startswith("http"):
        query = parse_qs(urlparse(pasted).query)
        if query.get("state", [""])[0] != state:
            console.print("[red]✗ state không khớp — hãy chạy lại lệnh và dùng đúng link mới.[/red]")
            raise typer.Exit(1)
        code = query.get("code", [""])[0]
    else:
        code = pasted
    tokens = tt.exchange_code(code)
    console.print(f"[green]✓ Đã kết nối TikTok. Quyền: {tokens.get('scope')}[/green]")
