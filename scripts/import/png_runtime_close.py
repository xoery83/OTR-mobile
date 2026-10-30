"""PNG-only entry; reuse the validated retained-container/negative-close controller."""
import json
from pdf_runtime_close import main

if __name__ == '__main__':
    try:raise SystemExit(main("PNG"))
    except Exception:
        print(json.dumps({'status':'PNG_CLOSURE_UNCONFIRMED','verified':False}))
        raise SystemExit(1)
