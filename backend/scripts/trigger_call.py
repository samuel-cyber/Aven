"""Trigger an outbound BimpeAI call for a customer and print how to sync it.

Usage:
    python scripts/trigger_call.py <customer_id> [--to +234...] [--live] [--wait]

  --to     dial this number instead of the customer's stored phone (use your
           own number to test the agent end to end).
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
    argv = sys.argv[1:]

    # Pull out --to <number> (dials a specific number instead of the customer's).
    destination = None
    if "--to" in argv:
        i = argv.index("--to")
        if i + 1 < len(argv):
            destination = argv[i + 1]
            del argv[i : i + 2]

    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    if len(args) != 1:
        print(__doc__)
        sys.exit(1)

    customer_id = args[0]
    is_test_call = "--live" not in flags

    result = voice.start_voice_call(
        customer_id, is_test_call=is_test_call, destination=destination
    )
    print(json.dumps(result, indent=2))

    if result.get("ok") and result.get("call_id") and "--wait" in flags:
        print("\nWaiting for the call to end, then extracting...")
        synced = voice.sync_voice_call(customer_id, result["call_id"], wait=True)
        print(json.dumps(synced, indent=2))


if __name__ == "__main__":
    main()
