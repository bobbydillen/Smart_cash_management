"""
Payments reconciliation: the sales-vs-payments matching engine, as a function of this app.

 - On Vercel this file is served at  POST /api/recon  (Python runtime, next to the Next.js app).
 - Locally, `npm run recon:dev` starts it on port 5000 and `next dev` forwards /api/recon to it.

It only accepts requests that carry a short-lived token signed by the Next.js app, which hands the
token out to a signed-in admin (see lib/recon-token.ts). The matching code itself lives in ../recon
and is unchanged from the standalone reconciliation app.
"""
import base64
import csv
import hashlib
import hmac
import os
import re
import sys
import tempfile
import time

from flask import Flask, jsonify, request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "recon"))

from pipeline import run_reconciliation  # noqa: E402

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024  # Vercel rejects bodies over ~4.5 MB anyway

ON_VERCEL = bool(os.environ.get("VERCEL"))
# the same secret the Next.js app signs with; on Vercel it must be set
SECRET = os.environ.get("RECON_SECRET") or ("" if ON_VERCEL else "local-dev-recon")


def _token_ok(token: str) -> bool:
    """Token looks like '<expiry seconds>.<hex hmac>', signed with RECON_SECRET."""
    if not SECRET or not token or "." not in token:
        return False
    exp, sig = token.split(".", 1)
    if not exp.isdigit() or int(exp) < time.time():
        return False
    good = hmac.new(SECRET.encode(), exp.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(good, sig)


def _save(storage, folder):
    # never trust client file names
    name = os.path.basename(storage.filename or "upload").replace("..", "_") or "upload"
    path = os.path.join(folder, f"{len(os.listdir(folder))}_{name}")
    storage.save(path)
    return path


def _text_csv(text, folder, name):
    """Typed rows 'time,amount,ref' (header optional) -> csv file, or None if empty."""
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    if not lines:
        return None
    if not lines[0].lower().startswith("time"):
        lines.insert(0, "time,amount,ref")
    path = os.path.join(folder, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path


_AMOUNT_ONLY = re.compile(r"^[\d.,\s₹]*(?:rs\.?)?[\d.,\s]*$", re.I)


def _machine_csv(text, folder, name):
    """Card-slip entry. Easiest form: just amounts (one per line or space-separated, '1,200' ok).
    Optional richer lines 'time,amount,ref' (e.g. 17:03,620,097776) still work; time/ref may be blank."""
    rows = []
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.lower().startswith("time"):
            continue
        if _AMOUNT_ONLY.match(line):
            for tok in line.replace("₹", " ").replace("Rs.", " ").replace("rs.", " ").split():
                tok = tok.replace(",", "")
                if tok:
                    rows.append(("", tok, ""))
        else:
            parts = [p.strip() for p in line.split(",")]
            if ":" in parts[0] and len(parts) >= 2:
                rows.append((parts[0], parts[1], ",".join(parts[2:])))
            elif len(parts) >= 1:
                rows.append(("", parts[0], ",".join(parts[1:])))
    if not rows:
        return None
    path = os.path.join(folder, name)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["time", "amount", "ref"])
        w.writerows(rows)
    return path


@app.route("/api/recon", methods=["POST"])
@app.route("/", methods=["POST"])
def run():
    if ON_VERCEL and not SECRET:
        return jsonify(error="The reconciliation is not set up on this server (RECON_SECRET is missing)."), 503
    if not _token_ok(request.headers.get("X-Recon-Token", "")):
        return jsonify(error="Please reload the page and try again (your session has expired)."), 401

    form, files = request.form, request.files
    shops = [s.strip() for s in form.get("shops", "").split(",") if s.strip()]
    if not shops:
        return jsonify(error="Enter at least one shop name."), 400
    date_label = form.get("date", "")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            pos = {}
            for i, shop in enumerate(shops):
                f = files.get(f"pos_{i}")
                if not f or not f.filename:
                    return jsonify(error=f"Upload the billing export for {shop}."), 400
                pos[shop] = _save(f, tmp)
            banks = []
            for j in range(min(int(form.get("n_banks", 0) or 0), 6)):
                label = (form.get(f"blabel_{j}") or f"Federal Bank - Account {j + 1}").strip()
                hint = (form.get(f"bhint_{j}") or "").strip()
                for k, f in enumerate(f for f in files.getlist(f"bank_{j}") if f.filename):
                    banks.append((label if k == 0 else f"{label} ({k + 1})", _save(f, tmp), hint if hint in shops else None))
            pp_up = [f for f in files.getlist("phonepe") if f.filename]
            pps = [("PhonePe" if len(pp_up) == 1 else f"PhonePe ({j + 1})", _save(f, tmp)) for j, f in enumerate(pp_up)]
            cms = []
            for j in range(min(int(form.get("n_machines", 0) or 0), 8)):
                label = (form.get(f"mlabel_{j}") or f"Card Machine {j + 1}").strip()
                hint = (form.get(f"mhint_{j}") or "").strip()
                up = files.get(f"mcsv_{j}")
                path = _save(up, tmp) if up and up.filename else _machine_csv(form.get(f"mtext_{j}"), tmp, f"m{j}.csv")
                if path:
                    cms.append((label, path, hint if hint in shops else None))
            trs = []
            tp = _machine_csv(form.get("transfers"), tmp, "transfers.csv")
            if tp:
                trs.append(("Direct Transfer", tp))
            if not (banks or pps or cms or trs):
                return jsonify(error="Add at least one payment source."), 400
            out = os.path.join(tmp, "report.xlsx")
            s = run_reconciliation(date_label, pos, banks, pps, cms, trs, out, log=lambda x: print("[reconcile]", x, flush=True))
            with open(out, "rb") as fh:
                xlsx = base64.b64encode(fh.read()).decode()
    except Exception as e:
        return jsonify(error=f"Could not complete the reconciliation: {e}"), 400
    s["unassigned"] = [dict(amount=p.amount, source=p.source, ref=p.ref, time=p.time_str) for p in s["unassigned"]]
    s["xlsx"] = xlsx
    return jsonify(s)


@app.errorhandler(413)
def too_big(_):
    return jsonify(error="Upload too large (limit about 4 MB in total)."), 413


if __name__ == "__main__":
    # local development: `next dev` forwards /api/recon here
    print("Reconciliation engine on http://127.0.0.1:5000/api/recon  (Ctrl+C to stop)")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
