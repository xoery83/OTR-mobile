#!/usr/bin/env python3
"""Optional loopback-only Files/Safari transfer of the two fixed synthetic originals.
No directory listing, upload, Source/Batch creation, credentials or Provider access.
"""
import argparse,hashlib,json,threading,time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

KNOWN={'universal-mixed-bookings-utf8.txt':'5db86cb62b681cc69eeee224f4af940cf10de5df6daa165102b3a37454a35592',
       'lodging-supplement.txt':'6a1ee8c1d59b603926523315563174f49cefc066ea96a45c8e028fc21e0a6af2'}
def originals(packet):
    result={}
    for entry in packet['realC3']['sources']:
        if entry['kind']!='FILE':continue
        name=entry['originalFilename'];data=Path(entry['path']).read_bytes()
        if name not in KNOWN or entry['sha256']!=KNOWN[name] or hashlib.sha256(data).hexdigest()!=KNOWN[name] or len(data)!=entry['byteCount']:raise ValueError('FIXED_QA_ORIGINAL_CHANGED')
        if name in result:raise ValueError('QA_ORIGINAL_REUSED')
        result[name]=data
    if set(result)!=set(KNOWN):raise ValueError('EXACT_TWO_QA_FILES_REQUIRED')
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--packet',type=Path,required=True);p.add_argument('--port',type=int,default=8765);p.add_argument('--seconds',type=int,default=600);a=p.parse_args()
    if not 1024<=a.port<=65535 or not 1<=a.seconds<=900:raise ValueError('FINITE_LOOPBACK_REQUIRED')
    files=originals(json.loads(a.packet.read_text()))
    deadline=time.monotonic()+a.seconds
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(max(.001,deadline-time.monotonic()))
        def log_message(self,*args):pass
        def response(self,body):
            if time.monotonic()>=deadline:
                self.close_connection=True
                return
            path=urlsplit(self.path)
            name=path.path.removeprefix('/')
            if path.query or name not in files:self.send_error(404);return
            data=files[name];self.send_response(200);self.send_header('Content-Type','text/plain; charset=utf-8');self.send_header('Content-Disposition','attachment; filename="'+name+'"');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers()
            if body:self.wfile.write(data)
        def do_GET(self):self.response(True)
        def do_HEAD(self):self.response(False)
    # Idle clients must not block shutdown; daemon handlers cannot outlive this
    # finite process, and each socket/request also observes the same deadline.
    server=ThreadingHTTPServer(('127.0.0.1',a.port),Handler)
    server.daemon_threads=True
    server.block_on_close=False
    timer=threading.Timer(a.seconds,server.shutdown);timer.daemon=True;timer.start()
    try:
        print(json.dumps({'status':'FIXED_SYNTHETIC_FILES_LOOPBACK_ONLY','expiresInSeconds':a.seconds,'urls':['http://127.0.0.1:'+str(a.port)+'/'+name for name in files]}),flush=True)
        server.serve_forever(poll_interval=.2)
    finally:timer.cancel();server.server_close()
if __name__=='__main__':main()
