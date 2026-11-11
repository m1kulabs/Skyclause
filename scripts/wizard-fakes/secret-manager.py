#!/usr/bin/env python3
"""A stand-in for gcloud, answering only the calls the Resend wizard makes: the signed-in account, Cloud Run's worker
URL, and Secret Manager secrets and versions. Versions are files in $FAKE_STATE/secrets/<NAME>/<n>; every call is logged
to $FAKE_STATE/gcloud.calls (without a secret's value), and anything else is recorded in $FAKE_STATE/unexpected."""

import json
import os
import sys

state_dir = os.environ["FAKE_STATE"]
config = json.load(open(os.path.join(state_dir, "config.json")))
args = sys.argv[1:]

with open(os.path.join(state_dir, "gcloud.calls"), "a") as out:
    out.write(" ".join(args) + "\n")
if os.environ.get("RESEND_FULL_ACCESS_KEY"):
    with open(os.path.join(state_dir, "key-in-env"), "a") as out:
        out.write("gcloud\n")


def versions(name):
    directory = os.path.join(state_dir, "secrets", name)
    return sorted(os.listdir(directory), key=int) if os.path.isdir(directory) else []


def fail(message):
    sys.stderr.write("ERROR: (gcloud) " + message + "\n")
    sys.exit(1)


if args[:2] == ["config", "get-value"]:
    print("owner@example.org")
elif args[:2] == ["secrets", "describe"]:
    if args[2] not in config["secrets"]:
        fail("NOT_FOUND: Secret [%s] not found" % args[2])
elif args[:3] == ["secrets", "versions", "list"]:
    if versions(args[3]):
        print("projects/413187272599/secrets/%s/versions/%s" % (args[3], versions(args[3])[-1]))
elif args[:3] == ["secrets", "versions", "access"] and args[3] == "latest":
    name = next(a.split("=", 1)[1] for a in args if a.startswith("--secret="))
    if not versions(name):
        fail("FAILED_PRECONDITION: Secret Version [%s/versions/latest] not found" % name)
    sys.stdout.write(open(os.path.join(state_dir, "secrets", name, versions(name)[-1])).read())
elif args[:3] == ["secrets", "versions", "add"]:
    directory = os.path.join(state_dir, "secrets", args[3])
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, str(len(versions(args[3])) + 1)), "w") as out:
        out.write(sys.stdin.read())
elif args[:3] == ["run", "services", "describe"] and args[3] == "worker":
    print(config["workerUrl"])
else:
    with open(os.path.join(state_dir, "unexpected"), "a") as out:
        out.write("gcloud " + " ".join(args) + "\n")
    sys.exit(97)
