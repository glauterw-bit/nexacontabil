import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  if (db) return db;
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'index.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Tabela principal: 1 linha por arquivo indexado
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      abs_path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT,
      mime TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      remote_doc_id TEXT,
      type TEXT,
      issuer_name TEXT,
      issuer_cnpj TEXT,
      total_value REAL,
      issue_date TEXT,
      due_date TEXT,
      extracted_text TEXT,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
    CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);
    CREATE INDEX IF NOT EXISTS idx_files_issuer_cnpj ON files(issuer_cnpj);
    CREATE INDEX IF NOT EXISTS idx_files_issue_date ON files(issue_date);
  `);

  // Índice FTS5 para busca textual rápida
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      filename, issuer_name, issuer_cnpj, type, extracted_text,
      content='files', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS files_fts_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, filename, issuer_name, issuer_cnpj, type, extracted_text)
      VALUES (new.id, new.filename, new.issuer_name, new.issuer_cnpj, new.type, new.extracted_text);
    END;
    CREATE TRIGGER IF NOT EXISTS files_fts_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, filename, issuer_name, issuer_cnpj, type, extracted_text)
      VALUES('delete', old.id, old.filename, old.issuer_name, old.issuer_cnpj, old.type, old.extracted_text);
    END;
    CREATE TRIGGER IF NOT EXISTS files_fts_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, filename, issuer_name, issuer_cnpj, type, extracted_text)
      VALUES('delete', old.id, old.filename, old.issuer_name, old.issuer_cnpj, old.type, old.extracted_text);
      INSERT INTO files_fts(rowid, filename, issuer_name, issuer_cnpj, type, extracted_text)
      VALUES (new.id, new.filename, new.issuer_name, new.issuer_cnpj, new.type, new.extracted_text);
    END;
  `);

  return db;
}

export interface FileRow {
  id: number;
  abs_path: string;
  filename: string;
  mtime: number;
  size: number;
  sha256?: string;
  mime?: string;
  status: 'pending' | 'reading' | 'uploading' | 'processed' | 'error';
  remote_doc_id?: string;
  type?: string;
  issuer_name?: string;
  issuer_cnpj?: string;
  total_value?: number;
  issue_date?: string;
  due_date?: string;
  extracted_text?: string;
  error?: string;
  created_at: number;
  updated_at: number;
}

export function upsertFile(file: Omit<FileRow, 'id' | 'created_at' | 'updated_at'>) {
  const d = initDatabase();
  const existing = d.prepare('SELECT id, mtime FROM files WHERE abs_path = ?').get(file.abs_path) as
    | { id: number; mtime: number } | undefined;
  if (existing && existing.mtime === file.mtime) {
    return { id: existing.id, changed: false };
  }
  const stmt = d.prepare(`
    INSERT INTO files (abs_path, filename, mtime, size, sha256, mime, status)
    VALUES (@abs_path, @filename, @mtime, @size, @sha256, @mime, @status)
    ON CONFLICT(abs_path) DO UPDATE SET
      mtime=excluded.mtime, size=excluded.size, sha256=excluded.sha256,
      status=excluded.status, updated_at=strftime('%s','now')
  `);
  const r = stmt.run({
    abs_path: file.abs_path,
    filename: file.filename,
    mtime: file.mtime,
    size: file.size,
    sha256: file.sha256 ?? null,
    mime: file.mime ?? null,
    status: file.status,
  });
  return { id: Number(r.lastInsertRowid) || existing?.id || 0, changed: true };
}

export function markUploaded(absPath: string, payload: Partial<FileRow>) {
  const d = initDatabase();
  const fields: string[] = ['status', 'updated_at'];
  const params: any = { abs_path: absPath, status: 'processed', updated_at: Math.floor(Date.now() / 1000) };
  const settable: (keyof FileRow)[] = ['remote_doc_id', 'type', 'issuer_name', 'issuer_cnpj',
    'total_value', 'issue_date', 'due_date', 'extracted_text'];
  for (const k of settable) {
    if ((payload as any)[k] !== undefined) {
      fields.push(k);
      params[k] = (payload as any)[k];
    }
  }
  const set = fields.map((f) => `${f}=@${f}`).join(', ');
  d.prepare(`UPDATE files SET ${set} WHERE abs_path=@abs_path`).run(params);
}

export function markError(absPath: string, error: string) {
  const d = initDatabase();
  d.prepare(`UPDATE files SET status='error', error=?, updated_at=strftime('%s','now') WHERE abs_path=?`)
    .run(error, absPath);
}

export function pendingFiles(limit = 100): FileRow[] {
  const d = initDatabase();
  return d.prepare(`SELECT * FROM files WHERE status IN ('pending','error') ORDER BY mtime DESC LIMIT ?`)
    .all(limit) as FileRow[];
}

export function counts() {
  const d = initDatabase();
  const r = d.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN status='pending' THEN 1 END) AS pending,
      COUNT(CASE WHEN status='processed' THEN 1 END) AS processed,
      COUNT(CASE WHEN status='error' THEN 1 END) AS errored,
      COUNT(CASE WHEN status='uploading' THEN 1 END) AS uploading
    FROM files
  `).get() as any;
  return r as { total: number; pending: number; processed: number; errored: number; uploading: number };
}

export function searchLocal(query: string, limit = 50): FileRow[] {
  const d = initDatabase();
  // Sanitize: FTS5 não gosta de operadores soltos. Aspas duplas por token.
  const ftsQuery = query
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(' OR ');
  if (!ftsQuery) return [];
  try {
    return d.prepare(`
      SELECT f.* FROM files f
      JOIN files_fts ON files_fts.rowid = f.id
      WHERE files_fts MATCH ?
      ORDER BY rank, f.mtime DESC
      LIMIT ?
    `).all(ftsQuery, limit) as FileRow[];
  } catch (err) {
    return [];
  }
}
