CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  active INTEGER NOT NULL,
  first_hour INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE snapshots (
  post_id TEXT NOT NULL REFERENCES posts(id),
  hour INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  impressions INTEGER,
  likes INTEGER,
  comments INTEGER,
  PRIMARY KEY (post_id, hour)
);
--> statement-breakpoint
CREATE INDEX snapshots_by_hour ON snapshots(hour);
--> statement-breakpoint
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
