#!/usr/bin/env python3
"""A stand-in for curl, answering as the Resend API does (https://resend.com/docs/api-reference), for the Resend
wizard's test. It keeps accounts, domains, webhooks and keys in $FAKE_STATE/resend.json, logs every request to
$FAKE_STATE/resend.calls, and answers shapes from Resend's OpenAPI document. $FAKE_STATE/config.json sets how it
behaves; any other host, or an unreadable request, is recorded in $FAKE_STATE/unexpected and fails the test."""

import json
import os
import re
import sys

state_dir = os.environ["FAKE_STATE"]
config = json.load(open(os.path.join(state_dir, "config.json")))
state_path = os.path.join(state_dir, "resend.json")
state = json.load(open(state_path)) if os.path.exists(state_path) else {"n": 0, "domains": [], "webhooks": [], "keys": []}
HOST = "https://api.resend.com"


def log(name, line):
    with open(os.path.join(state_dir, name), "a") as out:
        out.write(line + "\n")


def unexpected(what):
    log("unexpected", "curl " + what)
    sys.exit(97)


if os.environ.get("RESEND_FULL_ACCESS_KEY"):
    log("key-in-env", "curl")

args = sys.argv[1:]
method, body, fmt, url, stdin_config = "GET", None, None, args[-1], ""
i = 0
while i < len(args) - 1:
    if args[i] == "-K":
        stdin_config = sys.stdin.read()
        log("curl.stdin", stdin_config)
        i += 1
    elif args[i] == "-X":
        method, i = args[i + 1], i + 1
    elif args[i] == "-w":
        fmt, i = args[i + 1], i + 1
    elif args[i] == "--data":
        body, i = args[i + 1], i + 1
    elif args[i] == "-H":
        i += 1
    i += 1
if not url.startswith(HOST + "/"):
    unexpected(" ".join(args))
path, _, query = url[len(HOST):].partition("?")
payload = json.loads(body) if body else None
log("resend.calls", json.dumps({"method": method, "path": path, "query": query, "body": payload}))


def respond(code, answer):
    sys.stdout.write(json.dumps(answer))
    if fmt:
        sys.stdout.write("\n%d" % code)
    json.dump(state, open(state_path, "w"))
    sys.exit(0)


def error(code, name, message):
    respond(code, {"statusCode": code, "message": message, "name": name})


key = (re.search(r'Bearer (\S+)"', stdin_config) or [None, ""])[1]
if key == config["sendingOnlyKey"] or key in [k_["token"] for k_ in state["keys"]]:
    error(401, "restricted_api_key", "This API key is restricted to only send emails.")
if key != config["fullKey"]:
    error(400, "validation_error", "API key is invalid")


def new_id():
    state["n"] += 1
    return "%08d-0000-4000-8000-%012d" % (state["n"], state["n"])


def records(domain):
    """The DNS records for a domain, in the shapes of the docs' create-domain response. Names are relative to the
    DNS zone m1ku.tech (as Resend's Cloudflare guide shows) or to the domain, by config."""
    zone_relative = domain["name"][: -len(".m1ku.tech")]
    whole = config["recordNames"] == "zone"

    def name(label):
        return label + "." + zone_relative if whole else label

    status = {"verified": "verified", "pending": "pending"}.get(domain["status"], "not_started")
    dkim = {"record": "DKIM", "name": name("resend._domainkey"), "type": "TXT", "value": config["dkim"], "ttl": "Auto"}
    if domain["capabilities"]["sending"] == "disabled":
        rows = [dkim, {"record": "Receiving", "name": zone_relative if whole else "@", "type": "MX", "value": config["receivingMx"], "priority": 10, "ttl": "Auto"}]
    elif config["sendingRecords"] == "cname":
        rows = [dkim, {"record": "SPF", "name": name("send"), "type": "CNAME", "value": "cname-target.resend-test.example", "ttl": "Auto"}]
    else:
        rows = [
            dkim,
            {"record": "SPF", "name": name("send"), "type": "MX", "value": "feedback-smtp.ap-northeast-1.amazonses.com", "priority": 10, "ttl": "Auto"},
            {"record": "SPF", "name": name("send"), "type": "TXT", "value": "v=spf1 include:amazonses.com ~all", "ttl": "Auto"},
        ]
    if config.get("extraRecord"):
        rows.append(config["extraRecord"])
    return [dict(row, status=status) for row in rows]


def summary(domain):
    return {k: domain[k] for k in ("id", "name", "status", "created_at", "region", "open_tracking", "click_tracking", "capabilities")}


def domain_by_id(identifier):
    return next((d for d in state["domains"] if d["id"] == identifier), None) or error(404, "not_found", "Domain not found")


m = re.fullmatch(r"/domains(?:/([^/]+))?(/verify)?", path)
if m:
    identifier, verify = m.groups()
    if not identifier and method == "GET":
        respond(200, {"object": "list", "has_more": False, "data": [summary(d) for d in state["domains"]]})
    if not identifier and method == "POST":
        domain = {"id": new_id(), "name": payload["name"], "status": "not_started", "created_at": "2026-11-11 08:00:00.000000+00", "region": payload["region"],
                  "open_tracking": payload["open_tracking"], "click_tracking": payload["click_tracking"], "capabilities": payload["capabilities"]}
        state["domains"].append(domain)
        respond(201, dict(summary(domain), records=records(domain)))
    domain = domain_by_id(identifier)
    if verify and method == "POST":
        domain.update(status="pending", polls=0)
        respond(200, {"object": "domain", "id": domain["id"]})
    if method == "PATCH":
        domain.update({k: v for k, v in payload.items() if k in ("open_tracking", "click_tracking", "capabilities")})
        respond(200, {"object": "domain", "id": domain["id"]})
    if method == "GET":
        if "polls" in domain and domain["status"] != "verified":
            domain["polls"] += 1
            if domain["polls"] > config["verifyAfter"]:
                domain["status"] = config.get("verifyOutcome", "verified")
        respond(200, dict(summary(domain), object="domain", records=records(domain)))

m = re.fullmatch(r"/webhooks(?:/([^/]+))?", path)
if m:
    identifier = m.group(1)
    if not identifier and method == "GET":
        respond(200, {"object": "list", "has_more": False, "data": [{k: w[k] for k in ("id", "endpoint", "events", "status", "created_at")} for w in state["webhooks"]]})
    if not identifier and method == "POST":
        hook = {"id": new_id(), "endpoint": payload["endpoint"], "events": payload["events"], "status": "enabled",
                "created_at": "2026-11-11T08:00:00.000Z", "signing_secret": "whsec_test%d" % (state["n"] + 1)}
        state["webhooks"].append(hook)
        respond(201, {"object": "webhook", "id": hook["id"], "signing_secret": hook["signing_secret"]})
    hook = next((w for w in state["webhooks"] if w["id"] == identifier), None) or error(404, "not_found", "Webhook not found")
    if method == "GET":
        respond(200, dict(hook, object="webhook"))
    if method == "PATCH":
        hook.update({k: v for k, v in payload.items() if k in ("endpoint", "events", "status")})
        respond(200, {"object": "webhook", "id": hook["id"]})

m = re.fullmatch(r"/api-keys(?:/([^/]+))?", path)
if m:
    identifier = m.group(1)
    if not identifier and method == "GET":
        respond(200, {"object": "list", "has_more": False, "data": [{k: v for k, v in k_.items() if k != "token"} for k_ in state["keys"]]})
    if not identifier and method == "POST":
        if payload.get("permission") not in ("full_access", "sending_access"):
            error(422, "validation_error", "permission is invalid")
        if payload.get("domain_id") and not any(d["id"] == payload["domain_id"] for d in state["domains"]):
            error(422, "validation_error", "domain_id is unknown")
        created = {"id": new_id(), "name": payload["name"], "created_at": "2026-11-11T08:00:00.000Z", "last_used_at": None, "token": "re_sending%d_testtoken" % (state["n"] + 1)}
        state["keys"].append(created)
        respond(201, {"id": created["id"], "token": created["token"]})
    if method == "DELETE":
        state["keys"] = [k_ for k_ in state["keys"] if k_["id"] != identifier]
        respond(200, {"object": "api-key", "id": identifier, "deleted": True})

unexpected("%s %s" % (method, path))
