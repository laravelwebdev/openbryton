#!/usr/bin/env python3
"""
dev_server.py
Development server untuk OpenBryton:
- Melayani file statis (HTML, JS, CSS)
- Mem-proxy route /api/bryton-climb ke AWS Lambda Bryton Active dengan header CORS
- Mem-proxy route /api/bryton-share ke server Bryton Active
"""

import http.server
import socketserver
import urllib.request
import urllib.error
import urllib.parse
import json
import sys

PORT = 8000

class OpenBrytonHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/bryton-climb':
            self.handle_climb_proxy(parsed.query)
        elif path == '/api/bryton-share':
            self.handle_share_proxy(parsed.query)
        else:
            self.send_error(404, 'Endpoint Not Found')

    def handle_climb_proxy(self, query):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_length)

            target_url = 'https://okaymlks2a.execute-api.us-west-2.amazonaws.com/prod/api/v1/?g1=150&g2=1.5&g3=150&c1=1.8&c2=2000&c3=300&d1=1000'
            req = urllib.request.Request(
                target_url,
                data=post_body,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(resp_data)

        except urllib.error.HTTPError as e:
            err_data = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(err_data)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))

    def handle_share_proxy(self, query):
        try:
            params = urllib.parse.parse_qs(query)
            user_id = params.get('userId', [''])[0]
            if not user_id:
                self.send_error(400, 'userId is required')
                return

            content_length = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_length)

            boundary = '----WebKitFormBoundaryDev' + str(abs(hash(self.path)))
            crlf = b'\r\n'
            route_name = params.get('name', ['BrytonRoute'])[0]
            filename = f"{route_name}.fit"

            multipart = (
                b'--' + boundary.encode('utf-8') + crlf +
                b'Content-Disposition: form-data; name="name"' + crlf + crlf +
                route_name.encode('utf-8') + crlf +
                b'--' + boundary.encode('utf-8') + crlf +
                b'Content-Disposition: form-data; name="file"; filename="' + filename.encode('utf-8') + b'"' + crlf +
                b'Content-Type: application/octet-stream' + crlf + crlf +
                post_body + crlf +
                b'--' + boundary.encode('utf-8') + b'--' + crlf
            )

            target_url = f'https://active.brytonsport.com/route/upload/{user_id}'
            headers = {
                'Content-Type': f'multipart/form-data; boundary={boundary}',
                'Origin': 'https://active.brytonsport.com',
                'Referer': 'https://active.brytonsport.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }

            req = urllib.request.Request(target_url, data=multipart, headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(resp_data)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), OpenBrytonHandler) as httpd:
        print(f"OpenBryton Dev Server running at http://localhost:{PORT}")
        httpd.serve_forever()
