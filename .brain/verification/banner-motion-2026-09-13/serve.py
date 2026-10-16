"""Loopback-only artifact server with byte ranges for correct WebM seeking."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
    def send_head(self):
        p=Path(self.translate_path(self.path)).resolve()
        if not p.is_relative_to(ROOT) or p.is_relative_to(ROOT/'runtime'):
            self.send_error(403);return
        self.remaining=None
        if p.is_file() and self.headers.get('Range'):
            m=re.fullmatch(r'bytes=(\d+)-(\d*)',self.headers['Range'])
            size=p.stat().st_size
            if not m or int(m[1])>=size:
                self.send_error(416);return
            start=int(m[1]);end=min(int(m[2]) if m[2] else size-1,size-1)
            if end<start:self.send_error(416);return
            f=p.open('rb');f.seek(start);self.remaining=end-start+1
            self.send_response(206);self.send_header('Content-Type',self.guess_type(str(p)))
            self.send_header('Content-Length',str(self.remaining));self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.send_header('Accept-Ranges','bytes');self.end_headers();return f
        return super().send_head()
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        self.send_header('Accept-Ranges','bytes')
        super().end_headers()
    def copyfile(self,source,outputfile):
        if self.remaining is None:return super().copyfile(source,outputfile)
        while self.remaining:
            data=source.read(min(self.remaining,65536))
            if not data:break
            outputfile.write(data);self.remaining-=len(data)
ThreadingHTTPServer(('127.0.0.1',8768),Handler).serve_forever()
