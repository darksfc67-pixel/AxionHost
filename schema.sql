CREATE TABLE IF NOT EXISTS axion_servers (
  firebase_uid TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready')),
  server_id TEXT,
  server_identifier TEXT,
  server_name TEXT NOT NULL,
  address TEXT,
  port INTEGER,
  created_at TEXT NOT NULL
);
