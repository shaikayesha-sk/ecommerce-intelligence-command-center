import http.server
import json
import sqlite3
import os

PORT = 3000
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(WORKSPACE_DIR, 'public')
DB_PATH = os.path.join(WORKSPACE_DIR, 'ecommerce.db')

class CommandCenterHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Allow serving data files from the data directory directly
        if self.path.startswith('/data/'):
            # lstrip leading slash
            rel_path = self.path.lstrip('/')
            full_path = os.path.join(WORKSPACE_DIR, rel_path)
            if os.path.exists(full_path) and os.path.isfile(full_path):
                self.send_response(200)
                if full_path.endswith('.json'):
                    self.send_header('Content-Type', 'application/json')
                elif full_path.endswith('.csv'):
                    self.send_header('Content-Type', 'text/csv')
                else:
                    self.send_header('Content-Type', 'application/octet-stream')
                self.end_headers()
                with open(full_path, 'rb') as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_response(404)
                self.end_headers()
                return
        # Default behavior serves public static files
        super().do_GET()
    def __init__(self, *args, **kwargs):
        # Override target directory to serve frontend files from public/
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_POST(self):
        if self.path == '/api/query':
            # Parse Content Length to read body
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                query = data.get('query')
            except Exception as e:
                self.send_json_response(400, {'success': False, 'error': f'Invalid JSON payload: {str(e)}'})
                return

            if not query or not isinstance(query, str):
                self.send_json_response(400, {'success': False, 'error': 'SQL query string is required in "query" body field.'})
                return

            # Execute SQL Query on ecommerce.db
            conn = None
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row  # Returns rows as dictionary-like objects
                cursor = conn.cursor()
                
                # Check if it is a SELECT/read operation
                stripped_query = query.strip().upper()
                is_select = stripped_query.startswith(('SELECT', 'WITH', 'PRAGMA', 'EXPLAIN'))
                
                cursor.execute(query)
                
                if is_select:
                    rows = cursor.fetchall()
                    result_rows = [dict(row) for row in rows]
                    self.send_json_response(200, {
                        'success': True,
                        'type': 'select',
                        'rows': result_rows
                    })
                else:
                    conn.commit()
                    changes = conn.total_changes
                    last_row_id = cursor.lastrowid
                    self.send_json_response(200, {
                        'success': True,
                        'type': 'write',
                        'changes': changes,
                        'lastInsertRowid': str(last_row_id) if last_row_id is not None else "0"
                    })
            except Exception as err:
                self.send_json_response(400, {
                    'success': False,
                    'error': str(err)
                })
            finally:
                if conn:
                    conn.close()
        else:
            self.send_json_response(404, {'success': False, 'error': 'Endpoint not found.'})

    def send_json_response(self, status_code, data):
        try:
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
        except Exception as e:
            print(f"Error sending response: {e}")

if __name__ == '__main__':
    # Make sure public and database exist
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    if not os.path.exists(DB_PATH):
        print(f"WARNING: SQLite database not found at {DB_PATH}. Please run generate_data.py first.")
        
    server_address = ('', PORT)
    httpd = http.server.HTTPServer(server_address, CommandCenterHandler)
    print(f"================================================================")
    print(f"E-Commerce Intelligence Command Center Server is Live!")
    print(f"Local URL: http://localhost:{PORT}")
    print(f"Serving static dashboard from public/ using Python backend")
    print(f"================================================================")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()
