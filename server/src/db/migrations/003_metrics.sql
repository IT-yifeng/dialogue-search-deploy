-- M7 轻量埋点（手册 §5）
CREATE TABLE search_metrics (
  id           BIGSERIAL PRIMARY KEY,
  session_id   TEXT,
  q            TEXT NOT NULL,
  exact        BOOLEAN NOT NULL,
  season       INT,
  result_total INT NOT NULL,
  relaxed      BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX search_metrics_created_at ON search_metrics (created_at);
CREATE INDEX search_metrics_session_id ON search_metrics (session_id) WHERE session_id IS NOT NULL;

CREATE TABLE engagement_events (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('play', 'select', 'share', 'copy')),
  line_id     BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX engagement_events_session_id ON engagement_events (session_id);
CREATE INDEX engagement_events_created_at ON engagement_events (created_at);
