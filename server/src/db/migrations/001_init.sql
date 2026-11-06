-- 001_init：建表与搜索索引（手册 §5）。迁移只前进、不回滚。

-- trigram 索引让 ILIKE '%关键词%' 的子串搜索走索引，中英文都适用，不需要中文分词
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE episodes (
  id          SERIAL PRIMARY KEY,
  season      INT  NOT NULL,
  episode     INT  NOT NULL,
  title_en    TEXT,
  title_zh    TEXT,
  video_key   TEXT,                 -- 存储里的对象键，如 tbbt/S01E01.mp4；为空表示只有文字
  duration_ms INT,
  offset_ms   INT NOT NULL DEFAULT 0, -- 入库时已平移的偏移量，仅作记录
  UNIQUE (season, episode)
);

CREATE TABLE lines (
  id         BIGSERIAL PRIMARY KEY,
  episode_id INT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  idx        INT NOT NULL,          -- 集内序号，用于取上下文
  start_ms   INT NOT NULL,
  end_ms     INT NOT NULL,
  en         TEXT NOT NULL DEFAULT '',
  zh         TEXT NOT NULL DEFAULT '',
  UNIQUE (episode_id, idx),
  CHECK (end_ms > start_ms)
);

-- 子串搜索索引：同时支持英文和中文，无需中文分词
CREATE INDEX lines_en_trgm ON lines USING gin (en gin_trgm_ops);
CREATE INDEX lines_zh_trgm ON lines USING gin (zh gin_trgm_ops);

CREATE TABLE shares (
  id         TEXT PRIMARY KEY,      -- 8 位 base62 短 ID
  line_ids   BIGINT[] NOT NULL,     -- 保持用户勾选顺序
  note       TEXT,                  -- 分享留言，可空，≤100 字
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  view_count INT NOT NULL DEFAULT 0
);
