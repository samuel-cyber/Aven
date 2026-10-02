"""Trigger an outbound BimpeAI call for a customer and print how to sync it.

Usage:
    python scripts/trigger_call.py <customer_id> [--live] [--wait]

  --live   place a real (non-test) call; needs a phone number linked to the
           agent in the BimpeAI console.
  --wait   after starting, poll BimpeAI until the call ends, then run the
           extraction + action pipeline on the transcript (no public webhook
           needed).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import voice  # noqa: E402


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if len(args) != 1:
        print(__doc__)
        sys.exit(1)

    customer_id = args[0]
    is_test_call = "--live" not in flags

    result = voice.start_voice_call(customer_id, is_test_call=is_test_call)
    print(json.dumps(result, indent=2))

    if result.get("ok") and result.get("call_id") and "--wait" in flags:
        print("\nWaiting for the call to end, then extracting...")
        synced = voice.sync_voice_call(customer_id, result["call_id"], wait=True)
        print(json.dumps(synced, indent=2))


if __name__ == "__main__":
    main()
