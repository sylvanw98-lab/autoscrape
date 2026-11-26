ALTER TABLE posts ADD COLUMN parent_id TEXT REFERENCES posts(id);
