"""Fails if any script other than generate.py and evaluate.py reads data/truth/, or if name origin leaks.

Two checks:
  1. Static: no source file (scripts, sql, web) mentions the truth folder, except the two allowed scripts.
     The name-origin file may only be named in generate.py and evaluate.py.
  2. Runtime: build_db.py, check_summaries.py and write_summaries.py --dry-run run under an audit hook that
     raises on any file access inside data/truth/ or data/fairness/.
Run:  python tests/test_truth_access.py   (or with pytest)
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_TRUTH = {"generate.py", "evaluate.py"}
ALLOWED_ORIGIN = {"generate.py", "evaluate.py"}
SOURCES = [p for pattern in ("scripts/*.py", "sql/*.sql", "web/app/**/*.tsx", "web/components/*.tsx", "web/lib/*.ts")
           for p in ROOT.glob(pattern)]


def test_static_no_truth_reference():
    bad = [p.name for p in SOURCES if p.name not in ALLOWED_TRUTH
           and re.search(r"data/truth|planted\.csv|[\"']truth[\"']", p.read_text(encoding="utf-8"))]
    assert not bad, f"these files refer to the answer key: {bad}"


def test_static_no_name_origin_reference():
    bad = [p.name for p in SOURCES if p.name not in ALLOWED_ORIGIN
           and re.search(r"(?<!by_)name_origin|data/fairness", p.read_text(encoding="utf-8"))]
    # "fairness_by_name_origin_group" (the aggregate in data/eval/scores.json) is allowed: no customer-level group.
    assert not bad, f"these files refer to name origin: {bad}"


GUARD = r"""
import os, runpy, sys
blocked = [os.path.normcase(os.path.join(sys.argv[1], 'data', d)) for d in ('truth', 'fairness')]
def hook(event, args):
    if event in ('open', 'os.listdir', 'os.scandir') and args and isinstance(args[0], (str, bytes, os.PathLike)):
        p = os.path.normcase(os.path.abspath(os.fsdecode(args[0])))
        if any(p == b or p.startswith(b + os.sep) for b in blocked):
            raise AssertionError('forbidden read: ' + p)
sys.addaudithook(hook)
sys.argv = [sys.argv[2]] + sys.argv[3:]
runpy.run_path(sys.argv[0], run_name='__main__')
"""


def run_guarded(script, *args):
    r = subprocess.run([sys.executable, "-c", GUARD, str(ROOT), str(ROOT / "scripts" / script), *args],
                       capture_output=True, text=True, encoding="utf-8", cwd=ROOT)
    assert "forbidden read" not in (r.stdout + r.stderr), f"{script} read a forbidden file:\n{r.stderr[-800:]}"
    assert r.returncode == 0, f"{script} failed:\n{r.stderr[-800:]}"


def test_runtime_build_db():
    run_guarded("build_db.py")


def test_runtime_check_summaries():
    run_guarded("check_summaries.py")


def test_runtime_write_summaries_dry_run():
    run_guarded("write_summaries.py", "--dry-run")


def test_guard_catches_a_read():
    """The guard itself works: reading the truth file under the hook must fail."""
    probe = ROOT / "data" / "checks" / "_probe.py"
    probe.write_text("open(r'%s').read()\n" % (ROOT / "data" / "truth" / "planted.csv"), encoding="utf-8")
    try:
        r = subprocess.run([sys.executable, "-c", GUARD, str(ROOT), str(probe)], capture_output=True, text=True, cwd=ROOT)
        assert "forbidden read" in r.stderr
    finally:
        probe.unlink()


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    if not (ROOT / "scripts" / "check_summaries.py").exists():  # before stage 3
        tests = [t for t in tests if "summaries" not in t.__name__]
    for t in tests:
        t()
        print(f"PASS {t.__name__}")
    print(f"All {len(tests)} truth-access tests passed.")
