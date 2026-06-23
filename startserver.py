import http.server
import socketserver


class BrowserFriendlyHandler(http.server.SimpleHTTPRequestHandler):
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError):
            # Silently catch browser drops when establishing connections
            pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionError, OSError):
            # Silently catch browser drops mid-request
            pass


PORT = 8080
# Allow the port to be reused immediately after restart
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), BrowserFriendlyHandler) as httpd:
    print(f"Serving securely on http://localhost:{PORT}")
    httpd.serve_forever()
