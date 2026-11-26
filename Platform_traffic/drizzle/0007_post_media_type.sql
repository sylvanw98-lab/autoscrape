ALTER TABLE posts ADD COLUMN media_type TEXT NOT NULL DEFAULT 'unknown'
  CHECK (media_type IN ('image', 'video', 'unknown'));
--> statement-breakpoint
UPDATE posts SET media_type='image' WHERE platform='TikTok' AND url LIKE '%/photo/%';
--> statement-breakpoint
UPDATE posts SET media_type='video' WHERE
  (platform='TikTok' AND url LIKE '%/video/%') OR
  (platform='Instagram' AND (url LIKE '%/reel/%' OR url LIKE '%/reels/%' OR url LIKE '%/tv/%'));
