import http.server
import socketserver
import sys


class InternetFacingHandler(http.server.SimpleHTTPRequestHandler):
    directory = "web"

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            # Suppress public internet drops, bot scans, and network resets
            pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionError, OSError):
            # Suppress client timeouts and abruptly cut connections
            pass


def get_port():
    # If a port is passed in the terminal (e.g., script.py 8080), use it
    if len(sys.argv) > 1:
        try:
            return int(sys.argv[1])
        except ValueError:
            print("Invalid port number provided. Falling back to default port 8000.")
    return 8000


if __name__ == "__main__":
    PORT = get_port()

    # Crucial for DDNS/No-IP: Listen on "" (0.0.0.0) so it accepts external WAN traffic
    HOST = ""

    # Allow immediate restart on the same port without "Address already in use" errors
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer((HOST, PORT), InternetFacingHandler) as httpd:
            print(f"Serving web/ on all interfaces (Port: {PORT})")
            print(f"Open: http://localhost:{PORT}")
            httpd.serve_forever()
    except PermissionError:
        print(
            f"Error: Port {PORT} requires root/administrator privileges. Try a port above 1024."
        )
    except KeyboardInterrupt:
        print("\nServer shut down gracefully.")
