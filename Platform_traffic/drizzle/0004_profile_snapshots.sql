CREATE TABLE profile_snapshots (
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  followers INTEGER NOT NULL,
  PRIMARY KEY (platform, handle, captured_at)
);