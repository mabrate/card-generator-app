"""Serve Classroom Cards using Python's standard library; no app backend."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path

SITE = Path(__file__).resolve().parent / 'static-app'


def main():
    parser = argparse.ArgumentParser(description='Serve the Classroom Cards static app.')
    parser.add_argument('--host', default=os.environ.get('CARD_APP_HOST', '127.0.0.1'))
    parser.add_argument('--port', type=int, default=int(os.environ.get('CARD_APP_PORT', '8765')))
    args = parser.parse_args()
    if not SITE.is_dir():
        parser.error('The static-app directory is missing.')
    handler = partial(SimpleHTTPRequestHandler, directory=str(SITE))
    try:
        server = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as error:
        parser.exit(1, f'Cannot start Classroom Cards: {error}\n')
    with server:
        address = '127.0.0.1' if args.host in ('0.0.0.0', '::') else args.host
        print(f'Classroom Cards: http://{address}:{server.server_port}/', flush=True)
        if args.host == '0.0.0.0':
            print(f'LAN devices: http://<this computer\'s LAN IP>:{server.server_port}/', flush=True)
        print('Serving static-app only. Student work stays in each browser. Ctrl+C to stop.', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
