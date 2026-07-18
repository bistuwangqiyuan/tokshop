"""One-off: add env vars to the tokshop Vercel project via REST API.

Reads the Vercel token from the CLI auth.json and secret values from the
sibling tokenshop repo's _env_*.txt files (gitignored, never committed).
Usage: python scripts/set_env.py
"""
import json
import os
import urllib.request

TEAM = "team_YGHwcSYBmIm8oX9Yq7bBoPWP"
PROJECT = "prj_z1kAVXY93yeUivqMGwtzy1Qm9cgm"
ENV_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "tokenshop", "scripts")

auth_path = os.path.expandvars(r"%APPDATA%\xdg.data\com.vercel.cli\auth.json")
with open(auth_path, encoding="utf-8") as f:
    token = json.load(f)["token"]


def read_secret(name: str) -> str:
    with open(os.path.join(ENV_DIR, f"_env_{name}.txt"), encoding="utf-8") as f:
        return f.read().strip()


def upsert(key: str, value: str):
    body = json.dumps(
        {
            "key": key,
            "value": value,
            "type": "encrypted",
            "target": ["production", "preview", "development"],
        }
    ).encode()
    req = urllib.request.Request(
        f"https://api.vercel.com/v10/projects/{PROJECT}/env?teamId={TEAM}&upsert=true",
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        print(key, "->", r.status)


upsert("CRON_SECRET", read_secret("CRON_SECRET"))
upsert("INDEXNOW_KEY", read_secret("INDEXNOW_KEY"))
