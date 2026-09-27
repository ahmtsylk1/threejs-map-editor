"""
dev_server.py — Basit geliştirme sunucusu (önbelleksiz, çok iş parçacıklı).

ES6 modülleri tarayıcı tarafından agresif biçimde önbelleğe alındığı için,
kaynak kodu değiştirdikten sonra tarayıcı ESKİ dosyayı sunabiliyor.
Bu sunucu her yanıta `Cache-Control: no-store` ekler.

`ThreadingHTTPServer` KULLANILIR çünkü tarayıcı bir sayfayı paralel olarak
6'ya kadar bağlantıdan çeker. Tek iş parçacıklı `TCPServer` bu bağlantıları
sıraya alıyor ve uygulama açılışında takılıyor/bağlantı reddediliyordu
(ES modül grafiği ~25 dosya). İş parçacıklı sunucu bu sorunu tamamen giderir.

Kullanım:
    python dev_server.py [port]
"""
import sys
import http.server

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5174


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # konsol gürültüsünü azalt

    def do_GET(self):
        # Favicon isteği konsolda 404 üretmesin (geliştirirken gürültü olur)
        if self.path.split('?')[0] == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True       # kapanırken bekleyen bağlantılar asılı kalmasın
    allow_reuse_address = True   # sunucu çökmeden hemen yeniden başlatılabilsin
    # `socketserver` varsayılanı 5. Sayfa açılışında Chrome paralel olarak 6
    # bağlantı açıyor, ayrıca Asset Panel ~355 thumbnail isteği gönderiyor.
    # 5 kişilik kuyruk taşınca işletim sistemi yeni bağlantıyı REDDEDİYOR
    # (ERR_CONNECTION_REFUSED) ve uygulamanın bir kısmı hiç yüklenmiyor.
    request_queue_size = 256


if __name__ == '__main__':
    with Server(('', PORT), NoCacheHandler) as httpd:
        print(f'Map Editor  ->  http://localhost:{PORT}')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nDurduruldu.')
