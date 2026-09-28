"""One-command offline startup after installing requirements."""
import os
import socket

if __name__ == "__main__":
    try:
        import uvicorn
        import fontTools  # noqa: F401
        import fastapi  # noqa: F401
    except ImportError:
        raise SystemExit("Dependencies are missing. Follow the one-time setup in README.md, then run .venv/bin/python run.py")
    port = int(os.environ.get("CARD_APP_PORT", "8000"))
    host = os.environ.get("CARD_APP_HOST", "0.0.0.0")
    print(f"\nClassroom Cards: http://localhost:{port}\nStudents: http://<this computer's LAN IP>:{port}/student", flush=True)
    try:
        addresses = sorted({entry[4][0] for entry in socket.getaddrinfo(socket.gethostname(), port, socket.AF_INET)})
        for address in addresses:
            if not address.startswith("127."):
                print(f"Possible LAN URL: http://{address}:{port}", flush=True)
    except OSError:
        pass
    uvicorn.run("app.main:app", host=host, port=port, proxy_headers=False)
