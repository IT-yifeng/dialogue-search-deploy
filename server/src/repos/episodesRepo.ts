// 季集仓储：只写 SQL，返回领域对象。
import type { Db } from '../db/client.js';

export interface EpisodeListItem {
  season: number;
  episode: number;
  titleEn: string | null;
  titleZh: string | null;
  hasVideo: boolean;
}

export interface EpisodesRepo {
  listAll(): Promise<EpisodeListItem[]>;
}

export function createEpisodesRepo(db: Db): EpisodesRepo {
  return {
    async listAll() {
      const res = await db.query<{
        season: number;
        episode: number;
        title_en: string | null;
        title_zh: string | null;
        has_video: boolean;
      }>(
        `SELECT season, episode, title_en, title_zh, (video_key IS NOT NULL) AS has_video
         FROM episodes
         ORDER BY season, episode`,
      );
      return res.rows.map((r) => ({
        season: r.season,
        episode: r.episode,
        titleEn: r.title_en,
        titleZh: r.title_zh,
        hasVideo: r.has_video,
      }));
    },
  };
}
