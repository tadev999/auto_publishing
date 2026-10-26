import path from 'node:path';
import { DB } from '@endo/core/db';

export function acquireServerLock(dataDir: string): () => void {
  const db = new DB(path.join(dataDir, 'app.db'));
  db.conn.exec('CREATE TABLE IF NOT EXISTS web_server_lock (id INTEGER PRIMARY KEY CHECK(id = 1), pid INTEGER NOT NULL)');
  try {
    db.conn.transaction(() => {
      const previous = db.one<{ pid: number }>('SELECT pid FROM web_server_lock WHERE id = 1');
      if (previous) {
        let alive = true;
        try { process.kill(previous.pid, 0); } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ESRCH') alive = false;
          else throw error;
        }
        if (alive) throw new Error(`A web server already owns this database (PID ${previous.pid}). Stop it before starting another instance.`);
      }
      db.run('INSERT INTO web_server_lock(id, pid) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET pid = excluded.pid', process.pid);
    }).immediate();
  } catch (error) {
    db.close();
    throw error;
  }
  return () => {
    try { db.run('DELETE FROM web_server_lock WHERE id = 1 AND pid = ?', process.pid); }
    finally { db.close(); }
  };
}
