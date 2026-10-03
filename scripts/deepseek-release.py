#!/usr/bin/env python3
"""Scoped release helper. No credentials are printed, persisted, or retried."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "hrsrrduwbqxnqddkexoy"
API = f"https://api.supabase.com/v1/projects/{PROJECT}"
APP = f"https://{PROJECT}.supabase.co"
TERMINAL = "('ready','added','failed','rejected')"
STATE_SQL = f"""select jsonb_build_object(
 'jobs',(select coalesce(jsonb_agg(x),'[]') from
   (select state,count(*) as count from scene_private.generation_jobs group by state) x),
 'pending',(select count(*) from scene_private.generation_jobs where state not in {TERMINAL}),
 'cron',(select coalesce(jsonb_agg(x),'[]') from
   (select jobname,schedule,active from cron.job where jobname in
    ('scene-generation-poll','scene-reconstruction-poll')) x),
 'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations)
) as snapshot"""
STOP_SQL = f"""begin;
lock table scene_private.generation_jobs in share row exclusive mode;
do $retire$ begin
 if exists(select 1 from scene_private.generation_jobs where state not in {TERMINAL}) then
   raise exception 'HY3_NONTERMINAL_JOBS_EXIST';
 end if;
 perform cron.alter_job(jobid,active:=false) from cron.job where jobname='scene-generation-poll';
end $retire$;
commit;"""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, method="GET", body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method,
        headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=60) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{method} failed with HTTP {exc.code}; response body withheld") from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError(f"{method} network result unknown; inspect remote state before retry") from None


def management_token():
    if os.environ.get("SUPABASE_ACCESS_TOKEN"):
        return os.environ["SUPABASE_ACCESS_TOKEN"]
    for account in ("supabase", "access-token"):
        result = subprocess.run(["security", "find-generic-password", "-s", "Supabase CLI",
            "-a", account, "-w"], capture_output=True, text=True, timeout=10)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    raise RuntimeError("Existing Supabase CLI credential unavailable")


def management(token, method, path, body=None):
    return request(API + path, method, body, {"Authorization": "Bearer " + token})


def read_env(path):
    values = {}
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.removeprefix("export ").partition("=")
        if sep:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key.strip()] = value
    return values


def login_from_env(path, role="OWNER"):
    """Return a session in memory for an existing account; caller must not print it."""
    env = read_env(path)
    if env.get("SUPABASE_URL", "").rstrip("/") != APP:
        raise RuntimeError("Test environment targets a different project")
    public = env["SUPABASE_PUBLISHABLE_KEY"]
    result = request(APP + "/auth/v1/token?grant_type=password", "POST", {
        "email": env[f"DEMO_{role}_EMAIL"], "password": env[f"DEMO_{role}_PASSWORD"]
    }, {"apikey": public})
    return result["access_token"], public


def remote_state(token):
    rows = management(token, "POST", "/database/query", {"query": STATE_SQL, "read_only": True})
    return rows[0]["snapshot"]


def validate_secrets(values):
    allowed = {"HY3_RETIRED", "TOKENDANCE_API_KEY"}
    if not isinstance(values, dict) or not values or set(values) - allowed:
        raise ValueError("Only HY3_RETIRED and TOKENDANCE_API_KEY may be changed")
    if any(not isinstance(value, str) or not value.strip() for value in values.values()):
        raise ValueError("Secret values must be nonempty strings")
    if "HY3_RETIRED" in values and values["HY3_RETIRED"] != "true":
        raise ValueError("This helper cannot re-enable HY3")
    return [{"name": name, "value": value} for name, value in values.items()]


def retire(token, env_file):
    access, public = login_from_env(env_file)
    capabilities = request(APP + "/functions/v1/scene-api/generation/capabilities", headers={
        "Authorization": "Bearer " + access, "apikey": public})
    # Unexpected response shapes fail closed. No job is submitted to probe retirement.
    if not isinstance(capabilities, dict) or any(
        capabilities.get(key) is not False for key in ("textToModel", "imageToModel", "texture")
    ):
        raise RuntimeError("Deployed API still permits generation or returned an unknown contract")
    management(token, "POST", "/database/query", {"query": STOP_SQL, "read_only": False})
    state = remote_state(token)
    generation = [job for job in state["cron"] if job["jobname"] == "scene-generation-poll"]
    if state["pending"] or len(generation) != 1 or generation[0]["active"]:
        raise RuntimeError("HY3 is not drained and stopped; runtime key was retained")
    management(token, "DELETE", "/secrets", ["HUNYUAN_API_KEY"])
    return {"generationStopped": True, "hunyuanKeyRemoved": True, "state": state}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="execute an explicitly selected mutation")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("inspect")
    sql = commands.add_parser("sql-file", help="run reviewed SQL; does not invent migration history")
    sql.add_argument("file")
    config = commands.add_parser("configure", help="JSON object from 0600 file or stdin (-)")
    config.add_argument("file")
    stop = commands.add_parser("retire-hy3", help="verify closed capabilities, drain, stop cron, remove key")
    stop.add_argument("--test-env", required=True)
    args = parser.parse_args()
    body = None
    if args.command == "sql-file":
        body = Path(args.file).read_text()
        if not body.strip():
            raise ValueError("SQL file is empty")
        plan = {"action": args.command, "sha256": hashlib.sha256(body.encode()).hexdigest(),
            "bytes": len(body.encode()), "migrationHistory": "caller-managed"}
    elif args.command == "configure":
        if args.file != "-" and Path(args.file).stat().st_mode & 0o077:
            raise ValueError("Secret input file must not be accessible by group or other users")
        body = validate_secrets(json.loads(sys.stdin.read() if args.file == "-" else Path(args.file).read_text()))
        plan = {"action": args.command, "names": [item["name"] for item in body]}
    else:
        plan = {"action": args.command}
    if args.command != "inspect" and not args.apply:
        print(json.dumps({"dryRun": True, "project": PROJECT, **plan}))
        return
    token = management_token()
    if args.command == "inspect":
        secrets = management(token, "GET", "/secrets")
        print(json.dumps({"project": PROJECT, "secretNames": sorted(item["name"] for item in secrets),
            "state": remote_state(token)}, ensure_ascii=False))
    elif args.command == "sql-file":
        management(token, "POST", "/database/query", {"query": body, "read_only": False})
        print(json.dumps({"completed": True, **plan}))
    elif args.command == "configure":
        management(token, "POST", "/secrets", body)
        print(json.dumps({"completed": True, **plan}))
    else:
        print(json.dumps(retire(token, args.test_env), ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Never print raw HTTP payloads, parsed secret input, environment values, or a session.
        if isinstance(exc, (RuntimeError, ValueError)) and not isinstance(exc, json.JSONDecodeError):
            print(str(exc), file=sys.stderr)
        else:
            print(f"Release operation failed ({type(exc).__name__}); details withheld", file=sys.stderr)
        sys.exit(1)
