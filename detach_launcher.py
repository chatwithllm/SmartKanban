#!/usr/bin/env python3
"""Launch orchestrator.py in a new session (setsid) so the parent shell's
SIGTERM does not propagate. Returns immediately with the new pid printed."""
import os
import subprocess
import sys
import datetime as dt

out = open("orchestrator_nohup.out", "ab", buffering=0)
out.write(f"\n=== relaunch {dt.datetime.now().isoformat()} ===\n".encode())

p = subprocess.Popen(
    [sys.executable, "orchestrator.py", "--project", ".", "--target", "android", "--no-browser"],
    stdin=subprocess.DEVNULL,
    stdout=out,
    stderr=subprocess.STDOUT,
    start_new_session=True,
    cwd=os.getcwd(),
)
print(f"relaunched orchestrator pid={p.pid} session_leader")
