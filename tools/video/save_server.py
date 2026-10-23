"""렌더 스튜디오용 로컬 서버: 저장소를 정적으로 서비스하고, POST /save?name=파일명 본문을 출력 폴더에 저장.
usage: python -I tools/video/save_server.py <port> <저장소 폴더> <출력 폴더>
로컬(127.0.0.1)에서만 받음."""
import os, sys, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

port, root, out = int(sys.argv[1]), os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])
os.makedirs(out, exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/save":
            return self.send_error(404)
        name = os.path.basename(parse_qs(u.query).get("name", [""])[0])
        if not name or name.startswith("."):
            return self.send_error(400, "bad name")
        n = int(self.headers.get("Content-Length", 0))
        with open(os.path.join(out, name), "wb") as f:
            left = n
            while left:
                chunk = self.rfile.read(min(left, 1 << 20))
                if not chunk:
                    break
                f.write(chunk); left -= len(chunk)
        self.send_response(200); self.send_header("Content-Type", "text/plain"); self.end_headers()
        self.wfile.write(f"saved {name} {n}".encode())

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=root)).serve_forever()
