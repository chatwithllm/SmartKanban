#!/usr/bin/env python3
"""
Fully autonomous native app build orchestrator.
Usage: python3 orchestrator.py --project /path/to/project --target macos

Pipeline: Branch → Audit → Plan → Vetoes → Build → QA loop → SHIP_READY.
Resume-safe: any stage whose output file already exists is skipped.
"""
import argparse
import http.server
import json
import os
import socket
import socketserver
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

DASHBOARD_PORT_START = 9000
DASHBOARD_PORT_ATTEMPTS = 20
MAX_RETRIES = 3
QA_MAX_ROUNDS = 6
STATUS_FILE = 'orchestrator_status.json'
BUILD_STATUS = 'build_status.json'

# Long-running stage timeouts (seconds)
TIMEOUT_AUDIT = 3 * 3600       # 3 h
TIMEOUT_PLAN = 4 * 3600        # 4 h
TIMEOUT_VETOES = 2 * 3600      # 2 h
TIMEOUT_BUILD = 12 * 3600      # 12 h
TIMEOUT_QA_AGENT = 3 * 3600    # 3 h per QA agent
TIMEOUT_QA_FIX = 6 * 3600      # 6 h for batch fix

_STATUS_LOCK = threading.Lock()


def find_free_port(start=DASHBOARD_PORT_START, attempts=DASHBOARD_PORT_ATTEMPTS):
    """Return the first port where we can actually listen — no SO_REUSEADDR on probe,
    so a port held by another process correctly fails bind() with EADDRINUSE."""
    for port in range(start, start + attempts):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(('', port))
            s.listen(1)
            s.close()
            return port
        except OSError:
            try:
                s.close()
            except Exception:
                pass
            continue
    raise RuntimeError(
        f'No free port in range {start}-{start + attempts - 1}'
    )


DASHBOARD_PORT = find_free_port()


# ── Utilities ─────────────────────────────────────────────────────────────────

def ts():
    return datetime.now().strftime('%H:%M:%S')


def elapsed(start):
    s = int(time.time() - start)
    return f'{s // 3600}h {(s % 3600) // 60}m {s % 60}s'


def _set_nested(base, dotted_key, value):
    """Set base['a']['b']['c'] = value given 'a.b.c'."""
    parts = dotted_key.split('.')
    cur = base
    for p in parts[:-1]:
        if p not in cur or not isinstance(cur[p], dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value


def update_status(patch):
    """Merge a patch dict into orchestrator_status.json. Keys may be dotted ('stages.audit.status')."""
    with _STATUS_LOCK:
        try:
            with open(STATUS_FILE) as f:
                status = json.load(f)
        except Exception:
            status = {}
        for k, v in patch.items():
            if '.' in k:
                _set_nested(status, k, v)
            else:
                if isinstance(v, dict) and isinstance(status.get(k), dict):
                    def merge(base, up):
                        for kk, vv in up.items():
                            if isinstance(vv, dict) and isinstance(base.get(kk), dict):
                                merge(base[kk], vv)
                            else:
                                base[kk] = vv
                    merge(status[k], v)
                else:
                    status[k] = v
        status['updated'] = ts()
        try:
            with open(STATUS_FILE, 'w') as f:
                json.dump(status, f, indent=2)
        except Exception as e:
            print(f'[STATUS] write failed: {e}')


def log(stage, msg):
    """Append a log line + print to console."""
    line = f'[{ts()}][{stage}] {msg}'
    print(line, flush=True)
    with _STATUS_LOCK:
        try:
            with open(STATUS_FILE) as f:
                status = json.load(f)
        except Exception:
            status = {}
        status.setdefault('log', []).append(line)
        status['log'] = status['log'][-50:]
        try:
            with open(STATUS_FILE, 'w') as f:
                json.dump(status, f, indent=2)
        except Exception:
            pass


def pause(reason):
    log('orchestrator', f'PAUSED: {reason}')
    update_status({
        'paused': True,
        'pause_reason': reason,
        'stage': 'paused',
    })
    try:
        with open('PAUSED.json', 'w') as f:
            json.dump({'reason': reason, 'timestamp': ts()}, f, indent=2)
    except Exception:
        pass
    print(f'\n⚠ PAUSED: {reason}')
    print('Fix the issue, delete PAUSED.json, then restart.')
    sys.exit(1)


def file_exists(path):
    return os.path.exists(os.path.join(os.getcwd(), path))


def signal_in_file(filepath, signal):
    try:
        with open(filepath, encoding='utf-8', errors='ignore') as f:
            return signal in f.read()
    except Exception:
        return False


# ── Claude runner ──────────────────────────────────────────────────────────────

def run_claude(prompt_file, stage_label, timeout=7200, completion_signal=None,
               check_files=None):
    """Run a claude CLI subprocess. Returns (success, output_text)."""
    log(stage_label, f'Starting — prompt: {prompt_file}')
    with open(prompt_file) as f:
        prompt = f.read()

    try:
        proc = subprocess.Popen(
            ['claude', '--dangerously-skip-permissions', '--print'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, cwd=os.getcwd(),
            bufsize=1,
        )
    except FileNotFoundError:
        pause("claude CLI not found on PATH. Install Claude Code CLI before running.")
        return False, ''

    lines = []

    def read():
        try:
            for line in proc.stdout:
                line = line.rstrip('\n')
                lines.append(line)
                if line.strip():
                    log(stage_label, line[:160])
        except Exception:
            pass

    t = threading.Thread(target=read, daemon=True)
    t.start()
    try:
        proc.stdin.write(prompt)
        proc.stdin.close()
    except Exception:
        pass

    t.join(timeout=timeout)
    if proc.poll() is None:
        log(stage_label, f'Timeout {timeout}s — terminating')
        try:
            proc.terminate()
            try:
                proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            pass

    try:
        proc.wait(timeout=60)
    except Exception:
        pass

    output = '\n'.join(lines)
    rc_ok = proc.returncode == 0

    found_signal = True
    if completion_signal:
        found_signal = completion_signal in output
        if not found_signal:
            scan_files = [STATUS_FILE, BUILD_STATUS, 'SHIP_READY.md']
            scan_files += [f'FINAL_FIXES_V{n}.md' for n in range(2, QA_MAX_ROUNDS + 2)]
            scan_files += ['FINAL_FIXES.md']
            if check_files:
                scan_files = list(check_files) + scan_files
            for f in scan_files:
                if file_exists(f) and signal_in_file(f, completion_signal):
                    found_signal = True
                    break

    # Signal-in-output-or-file wins. Claude rate-limit / wrapper exits with rc!=0
    # AFTER the work is already on disk — don't false-fail those.
    if completion_signal:
        success = found_signal
    else:
        success = rc_ok
    return success, output


# ── Stage runners ──────────────────────────────────────────────────────────────

def run_with_retry(prompt_file, stage, signal, retries=MAX_RETRIES, timeout=7200,
                   check_files=None):
    for attempt in range(1, retries + 1):
        log(stage, f'Attempt {attempt}/{retries}')
        ok, _ = run_claude(prompt_file, stage,
                           timeout=timeout,
                           completion_signal=signal,
                           check_files=check_files)
        if ok:
            log(stage, f'Complete on attempt {attempt}')
            return True
        log(stage, f'Attempt {attempt} failed — signal not found')
        time.sleep(5)
    pause(f'Stage {stage} failed after {retries} attempts. '
          f'Check {prompt_file} and project files.')
    return False


def run_branch(target):
    """Create or checkout the dedicated build branch. Skip if already on it."""
    branch_name = f'{target}-build'
    update_status({'branch': '', 'stage': 'starting'})

    if not os.path.isdir('.git'):
        log('branch', 'No .git — skipping branch step (continuing).')
        update_status({'branch': '(no git)'})
        return

    try:
        current = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            capture_output=True, text=True, cwd=os.getcwd(),
        ).stdout.strip()
    except Exception as e:
        log('branch', f'git failed: {e} — continuing.')
        update_status({'branch': '(git error)'})
        return

    if current == branch_name:
        log('branch', f'Already on {branch_name} — skipping')
        update_status({'branch': branch_name})
        return

    existing = subprocess.run(
        ['git', 'branch', '--list', branch_name],
        capture_output=True, text=True, cwd=os.getcwd(),
    ).stdout.strip()

    if existing:
        log('branch', f'Branch {branch_name} exists — checking out')
        r = subprocess.run(['git', 'checkout', branch_name], cwd=os.getcwd(),
                           capture_output=True, text=True)
        if r.returncode != 0:
            log('branch', f'checkout failed: {r.stderr.strip()} — staying on {current}')
            update_status({'branch': current})
            return
    else:
        log('branch', f'Creating branch {branch_name}')
        r = subprocess.run(['git', 'checkout', '-b', branch_name], cwd=os.getcwd(),
                           capture_output=True, text=True)
        if r.returncode != 0:
            log('branch', f'create failed: {r.stderr.strip()} — staying on {current}')
            update_status({'branch': current})
            return

    log('branch', f'Now on {branch_name}')
    update_status({'branch': branch_name})


def run_audit():
    if file_exists('FEATURE_PARITY_REGISTRY.md'):
        log('audit', 'Skipping — FEATURE_PARITY_REGISTRY.md exists')
        update_status({'stages.audit.status': 'done'})
        return
    update_status({'stages.audit.status': 'running', 'stage': 'audit'})
    run_with_retry('stage_prompts/00_audit.txt', 'audit',
                   'STAGE_COMPLETE: audit',
                   timeout=TIMEOUT_AUDIT,
                   check_files=['FEATURE_PARITY_REGISTRY.md'])
    update_status({'stages.audit.status': 'done'})


def run_plan(target='macos'):
    plan_map = {'macos': 'MACOS_APP_PLAN.md',
                'ios': 'IOS_APP_PLAN.md',
                'android': 'ANDROID_APP_PLAN.md'}
    plan_file = plan_map.get(target, 'MACOS_APP_PLAN.md')
    if file_exists(plan_file):
        log('plan', f'Skipping — {plan_file} exists')
        update_status({'stages.plan.status': 'done'})
        return
    update_status({'stages.plan.status': 'running', 'stage': 'plan'})
    run_with_retry('stage_prompts/01_plan.txt', 'plan',
                   'STAGE_COMPLETE: plan',
                   timeout=TIMEOUT_PLAN,
                   check_files=[plan_file])
    update_status({'stages.plan.status': 'done'})


def run_vetoes():
    if file_exists('VETO_RESOLUTION_PATCH.md'):
        log('vetoes', 'Skipping — VETO_RESOLUTION_PATCH.md exists')
        update_status({'stages.vetoes.status': 'done'})
        return
    update_status({'stages.vetoes.status': 'running', 'stage': 'vetoes'})
    run_with_retry('stage_prompts/02_vetoes.txt', 'vetoes',
                   'STAGE_COMPLETE: vetoes',
                   timeout=TIMEOUT_VETOES,
                   check_files=['VETO_RESOLUTION_PATCH.md'])
    update_status({'stages.vetoes.status': 'done'})


def run_build():
    if file_exists('BUILD_COMPLETE'):
        log('build', 'Skipping — BUILD_COMPLETE exists')
        update_status({'stages.build.status': 'done'})
        return
    update_status({'stages.build.status': 'running', 'stage': 'build'})
    ok, _ = run_claude(
        'stage_prompts/03_build.txt', 'build',
        timeout=TIMEOUT_BUILD,
        completion_signal='STAGE_COMPLETE: build',
        check_files=['BUILD_COMPLETE', BUILD_STATUS],
    )
    if not ok:
        # retry up to MAX_RETRIES (build is long — retry from where it stopped)
        for attempt in range(2, MAX_RETRIES + 1):
            log('build', f'Build retry {attempt}/{MAX_RETRIES}')
            ok, _ = run_claude(
                'stage_prompts/03_build.txt', 'build',
                timeout=TIMEOUT_BUILD,
                completion_signal='STAGE_COMPLETE: build',
                check_files=['BUILD_COMPLETE', BUILD_STATUS],
            )
            if ok or file_exists('BUILD_COMPLETE'):
                break
        if not (ok or file_exists('BUILD_COMPLETE')):
            pause('Build stage failed. Check build_status.json and app source.')
    if not file_exists('BUILD_COMPLETE'):
        Path('BUILD_COMPLETE').touch()
    update_status({'stages.build.status': 'done'})


def build_qa_prompts(round_num):
    """Write round-specific QA prompts to stage_prompts/. Returns the file names."""
    suffix = '' if round_num == 1 else f'_V{round_num}'
    fix_file = f'FINAL_FIXES{suffix}.md'
    audit_a = f'AUDIT_A{round_num + 1}.md'
    audit_b = f'AUDIT_B{round_num + 1}.md'
    prev_a = f'AUDIT_A{round_num}.md' if round_num > 1 else 'AUDIT_A.md'
    prev_b = f'AUDIT_B{round_num}.md' if round_num > 1 else 'AUDIT_B.md'
    out_fixes = f'FINAL_FIXES_V{round_num + 1}.md'

    subs = {
        '{{FIX_FILE}}': fix_file,
        '{{ROUND}}': str(round_num),
        '{{PREV_AUDIT}}': '',  # set per agent
        '{{OUTPUT}}': '',
        '{{AUDIT_A}}': audit_a,
        '{{AUDIT_B}}': audit_b,
        '{{OUT_FIXES}}': out_fixes,
    }

    def render(template_path, out_path, extra):
        with open(template_path) as f:
            tmpl = f.read()
        merged = dict(subs)
        merged.update(extra)
        for k, v in merged.items():
            tmpl = tmpl.replace(k, v)
        with open(out_path, 'w') as f:
            f.write(tmpl)

    render('stage_prompts/04_qa_fix.txt',
           f'stage_prompts/qa_fix_r{round_num}.txt', {})
    render('stage_prompts/04_qa_agent_a.txt',
           f'stage_prompts/qa_a_r{round_num}.txt',
           {'{{PREV_AUDIT}}': prev_a, '{{OUTPUT}}': audit_a})
    render('stage_prompts/04_qa_agent_b.txt',
           f'stage_prompts/qa_b_r{round_num}.txt',
           {'{{PREV_AUDIT}}': prev_b, '{{OUTPUT}}': audit_b})
    render('stage_prompts/04_qa_agent_c.txt',
           f'stage_prompts/qa_c_r{round_num}.txt', {})

    return fix_file, audit_a, audit_b, out_fixes


def build_initial_audit_prompts():
    """Initial 3-agent audit (no fixes yet) — uses 'init' round file names."""
    subs = {
        '{{FIX_FILE}}': '(none — initial audit)',
        '{{ROUND}}': '1 (initial)',
        '{{PREV_AUDIT}}': '(none)',
        '{{AUDIT_A}}': 'AUDIT_A.md',
        '{{AUDIT_B}}': 'AUDIT_B.md',
        '{{OUT_FIXES}}': 'FINAL_FIXES.md',
        '{{OUTPUT}}': '',
    }

    def render(template_path, out_path, extra):
        with open(template_path) as f:
            tmpl = f.read()
        merged = dict(subs)
        merged.update(extra)
        for k, v in merged.items():
            tmpl = tmpl.replace(k, v)
        with open(out_path, 'w') as f:
            f.write(tmpl)

    render('stage_prompts/04_qa_agent_a.txt',
           'stage_prompts/qa_a_init.txt', {'{{OUTPUT}}': 'AUDIT_A.md'})
    render('stage_prompts/04_qa_agent_b.txt',
           'stage_prompts/qa_b_init.txt', {'{{OUTPUT}}': 'AUDIT_B.md'})
    render('stage_prompts/04_qa_agent_c.txt',
           'stage_prompts/qa_c_init.txt', {})


def _qa_round_patch(round_num, patch):
    """Update a specific round entry inside stages.qa.rounds_detail."""
    with _STATUS_LOCK:
        try:
            with open(STATUS_FILE) as f:
                st = json.load(f)
        except Exception:
            return
        rounds = st.get('stages', {}).get('qa', {}).get('rounds_detail', [])
        changed = False
        for r in rounds:
            if r.get('round') == round_num:
                r.update(patch)
                changed = True
                break
        if changed:
            st.setdefault('stages', {}).setdefault('qa', {})['rounds_detail'] = rounds
            try:
                with open(STATUS_FILE, 'w') as f:
                    json.dump(st, f, indent=2)
            except Exception:
                pass


def run_initial_audit_for_qa():
    """Generate FINAL_FIXES.md from a 3-agent initial audit (A+B in parallel, then C)."""
    log('qa', 'Initial 3-agent audit — building prompts')
    build_initial_audit_prompts()
    update_status({
        'stages.qa.status': 'running',
        'stages.qa.round': 0,
        'stages.qa.current_agent': 'A+B (init)',
        'stages.qa.rounds_detail': [],
        'stage': 'qa',
    })

    results = {'a': False, 'b': False}

    def run_a():
        ok = run_with_retry('stage_prompts/qa_a_init.txt', 'qa_a_init',
                            'STAGE_COMPLETE: verified',
                            timeout=TIMEOUT_QA_AGENT,
                            check_files=['AUDIT_A.md'])
        results['a'] = ok

    def run_b():
        ok = run_with_retry('stage_prompts/qa_b_init.txt', 'qa_b_init',
                            'STAGE_COMPLETE: resolved',
                            timeout=TIMEOUT_QA_AGENT,
                            check_files=['AUDIT_B.md'])
        results['b'] = ok

    ta = threading.Thread(target=run_a)
    tb = threading.Thread(target=run_b)
    ta.start()
    tb.start()
    ta.join()
    tb.join()

    update_status({'stages.qa.current_agent': 'C (init)'})
    run_with_retry('stage_prompts/qa_c_init.txt', 'qa_c_init',
                   'STAGE_COMPLETE: verdict',
                   timeout=TIMEOUT_QA_AGENT,
                   check_files=['SHIP_READY.md', 'FINAL_FIXES.md'])
    update_status({'stages.qa.current_agent': ''})


def run_qa_loop():
    update_status({
        'stages.qa.status': 'running',
        'stage': 'qa',
        'stages.qa.rounds_detail': [],
        'stages.qa.total_rounds': 0,
    })

    if file_exists('SHIP_READY.md'):
        log('qa', 'Skipping — SHIP_READY.md exists')
        update_status({
            'stages.qa.status': 'done',
            'stages.qa.verdict': 'SHIP_READY',
            'verdict': 'SHIP_READY',
            'stages.qa.current_agent': '',
        })
        return

    if not file_exists('FINAL_FIXES.md'):
        log('qa', 'No FINAL_FIXES.md — running initial 3-agent audit')
        run_initial_audit_for_qa()

    if file_exists('SHIP_READY.md'):
        log('qa', 'SHIP_READY after initial audit')
        update_status({
            'stages.qa.status': 'done',
            'stages.qa.verdict': 'SHIP_READY',
            'verdict': 'SHIP_READY',
            'stages.qa.current_agent': '',
        })
        return

    for round_num in range(1, QA_MAX_ROUNDS + 1):
        suffix = '' if round_num == 1 else f'_V{round_num}'
        fix_file = f'FINAL_FIXES{suffix}.md'

        if not file_exists(fix_file):
            log('qa', f'Round {round_num}: {fix_file} not found — assuming SHIP_READY')
            Path('SHIP_READY.md').write_text(
                f'# Ship Ready\nDate: {ts()}\nRound: {round_num}\n'
                f'Verdict: SHIP_READY (no fix file for this round)\n'
            )
            update_status({
                'stages.qa.status': 'done',
                'stages.qa.verdict': 'SHIP_READY',
                'verdict': 'SHIP_READY',
                'stages.qa.current_agent': '',
            })
            return

        log('qa', f'Round {round_num} starting — {fix_file}')
        round_start = ts()
        update_status({
            'stages.qa.round': round_num,
            'stages.qa.total_rounds': round_num,
            'stages.qa.current_agent': f'Fix (round {round_num})',
        })

        with _STATUS_LOCK:
            try:
                with open(STATUS_FILE) as f:
                    st = json.load(f)
            except Exception:
                st = {}
            rounds = st.get('stages', {}).get('qa', {}).get('rounds_detail', [])
            rounds.append({
                'round': round_num,
                'started': round_start,
                'fix': 'running',
                'a': 'pending',
                'b': 'pending',
                'c': 'pending',
                'verdict': '',
            })
            st.setdefault('stages', {}).setdefault('qa', {})['rounds_detail'] = rounds
            try:
                with open(STATUS_FILE, 'w') as f:
                    json.dump(st, f, indent=2)
            except Exception:
                pass

        fix_file, audit_a, audit_b, out_fixes = build_qa_prompts(round_num)

        run_with_retry(f'stage_prompts/qa_fix_r{round_num}.txt',
                       f'qa_fix_r{round_num}', 'STAGE_COMPLETE: fixes',
                       timeout=TIMEOUT_QA_FIX,
                       check_files=[fix_file])
        _qa_round_patch(round_num, {'fix': 'done', 'a': 'running', 'b': 'running'})
        update_status({'stages.qa.current_agent': f'A+B (round {round_num})'})

        results = {'a': False, 'b': False}

        def run_a(r=round_num, audit_file=audit_a):
            ok = run_with_retry(f'stage_prompts/qa_a_r{r}.txt',
                                f'qa_a_r{r}', 'STAGE_COMPLETE: verified',
                                timeout=TIMEOUT_QA_AGENT,
                                check_files=[audit_file])
            results['a'] = ok
            _qa_round_patch(r, {'a': 'done'})

        def run_b(r=round_num, audit_file=audit_b):
            ok = run_with_retry(f'stage_prompts/qa_b_r{r}.txt',
                                f'qa_b_r{r}', 'STAGE_COMPLETE: resolved',
                                timeout=TIMEOUT_QA_AGENT,
                                check_files=[audit_file])
            results['b'] = ok
            _qa_round_patch(r, {'b': 'done'})

        ta = threading.Thread(target=run_a)
        tb = threading.Thread(target=run_b)
        ta.start()
        tb.start()
        ta.join()
        tb.join()

        update_status({'stages.qa.current_agent': f'C (round {round_num})'})
        _qa_round_patch(round_num, {'c': 'running'})

        run_with_retry(f'stage_prompts/qa_c_r{round_num}.txt',
                       f'qa_c_r{round_num}', 'STAGE_COMPLETE: verdict',
                       timeout=TIMEOUT_QA_AGENT,
                       check_files=['SHIP_READY.md', out_fixes])

        if file_exists('SHIP_READY.md'):
            log('qa', f'SHIP_READY after round {round_num}')
            _qa_round_patch(round_num, {'c': 'done', 'verdict': 'SHIP_READY'})
            update_status({
                'stages.qa.status': 'done',
                'stages.qa.verdict': 'SHIP_READY',
                'stages.qa.current_agent': '',
                'verdict': 'SHIP_READY',
            })
            return

        if not file_exists(out_fixes):
            log('qa', f'No {out_fixes} — assuming SHIP_READY')
            Path('SHIP_READY.md').write_text(
                f'# Ship Ready\nDate: {ts()}\nRound: {round_num}\n'
                f'Verdict: SHIP_READY (no further fix file generated)\n'
            )
            _qa_round_patch(round_num, {'c': 'done', 'verdict': 'SHIP_READY'})
            update_status({
                'stages.qa.status': 'done',
                'stages.qa.verdict': 'SHIP_READY',
                'stages.qa.current_agent': '',
                'verdict': 'SHIP_READY',
            })
            return

        _qa_round_patch(round_num, {'c': 'done', 'verdict': 'needs_fixes'})
        log('qa', f'Round {round_num} needs fixes — proceeding to round {round_num + 1}')
        time.sleep(5)

    pause(f'QA loop exceeded {QA_MAX_ROUNDS} rounds without SHIP_READY. '
          'Manual review needed.')


# ── HTTP server ────────────────────────────────────────────────────────────────

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args, **kwargs):
        pass


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', DASHBOARD_PORT), QuietHandler) as h:
        h.serve_forever()


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', required=True)
    parser.add_argument('--target', default='macos',
                        choices=['macos', 'ios', 'android'])
    args = parser.parse_args()

    project_dir = os.path.abspath(args.project)
    os.chdir(project_dir)

    print(f'Orchestrator starting — {project_dir} → {args.target}')
    print(f'Dashboard port: {DASHBOARD_PORT} (auto-selected)')

    if file_exists('PAUSED.json'):
        try:
            with open('PAUSED.json') as f:
                p = json.load(f)
            print(f'Previous run paused: {p.get("reason")}')
        except Exception:
            print('Previous run paused (could not read PAUSED.json).')
        print('Resolve and delete PAUSED.json to continue.')
        sys.exit(1)

    start = time.time()
    update_status({
        'started': ts(),
        'stage': 'starting',
        'project': project_dir,
        'target': args.target,
        'dashboard_port': DASHBOARD_PORT,
        'paused': False,
        'pause_reason': '',
        'completed': '',
        'verdict': '',
    })

    threading.Thread(target=serve, daemon=True).start()
    time.sleep(1)
    url = f'http://localhost:{DASHBOARD_PORT}/orchestrator_dashboard.html'
    try:
        webbrowser.open(url)
    except Exception:
        pass
    print(f'Dashboard: {url}')

    try:
        run_branch(args.target)
        run_audit()
        run_plan(args.target)
        run_vetoes()
        run_build()
        run_qa_loop()
    except SystemExit:
        raise
    except Exception as e:
        pause(f'Unexpected error: {e}')

    update_status({
        'stage': 'complete',
        'completed': ts(),
        'elapsed': elapsed(start),
        'verdict': 'SHIP_READY',
    })
    print(f'\n✅ SHIP READY — {elapsed(start)}')
    print(f'Dashboard: {url}')
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
