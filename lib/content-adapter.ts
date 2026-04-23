/**
 * Single adapter that bridges the live Supabase schema (UUID-keyed content
 * with absolute CDN URLs) to the field names the existing React components
 * already consume. This lets us migrate data without touching most of the
 * UI.
 *
 * Live schema:
 *   content.id (uuid) name poster_image backdrop_image logo_image
 *   categories[] search_tags[] release_year language description
 *   type='movie'|'show'|'anime' hash_key duration_sec tmdb_id(nullable)
 *
 * Component shape (historical):
 *   { tmdb_id, type:'movie'|'tv', title, poster_path, backdrop_path,
 *     rating, year, overview, logo_path, categories }
 *
 * Mapping:
 *   - id (uuid) → tmdb_id (string) so URLs keep working at /detail/[type]/[id]
 *   - name → title, poster_image → poster_path (absolute URL), etc.
 *   - DB types 'show' and 'anime' → client 'tv' for layout routing purposes
 *   - Real tmdb_id kept on `real_tmdb_id` for external lookups if ever needed
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type DbType = "movie" | "show" | "anime";

interface ContentRow {
  id: string;
  name: string | null;
  type: DbType;
  poster_image: string | null;
  backdrop_image: string | null;
  logo_image: string | null;
  categories: string[] | null;
  search_tags: string[] | null;
  release_year: number | null;
  description: string | null;
  language: string | null;
  duration_sec: number | null;
  hash_key: string | null;
  next_episode_timer_sec: number | null;
  tmdb_id: number | null;
  is_hidden: boolean | null;
  created_at: string | null;
}

export interface AdaptedContent {
  // Aliased identifier — UUID as string. Components + URLs use this.
  tmdb_id: string;
  real_tmdb_id: number | null;
  type: "movie" | "tv"; // 'show' + 'anime' collapsed to 'tv' for UI
  db_type: DbType; // preserve the original
  title: string;
  poster_path: string | null; // absolute URL
  backdrop_path: string | null; // absolute URL
  logo_path: string | null;
  rating: number; // not in schema; defaulted
  year: number | null;
  overview: string | null;
  categories: string[];
  language: string | null;
  duration_sec: number | null;
  hash_key: string | null;
  next_episode_timer_sec: number;
}

const DB_CONTENT_COLUMNS =
  "id,name,type,poster_image,backdrop_image,logo_image,categories,search_tags,release_year,description,language,duration_sec,hash_key,next_episode_timer_sec,tmdb_id,is_hidden,created_at";

function collapseType(t: DbType): "movie" | "tv" {
  return t === "movie" ? "movie" : "tv";
}

function adapt(row: ContentRow): AdaptedContent {
  return {
    tmdb_id: row.id,
    real_tmdb_id: row.tmdb_id,
    type: collapseType(row.type),
    db_type: row.type,
    title: row.name ?? "",
    poster_path: row.poster_image,
    backdrop_path: row.backdrop_image,
    logo_path: row.logo_image,
    rating: 0,
    year: row.release_year,
    overview: row.description,
    categories: row.categories ?? [],
    language: row.language,
    duration_sec: row.duration_sec,
    hash_key: row.hash_key,
    next_episode_timer_sec: row.next_episode_timer_sec ?? 10,
  };
}

export async function heroFeed(
  supabase: SupabaseClient,
  limit = 5
): Promise<AdaptedContent[]> {
  const { data } = await supabase
    .from("content")
    .select(DB_CONTENT_COLUMNS)
    .eq("is_hidden", false)
    .not("backdrop_image", "is", null)
    .not("hash_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => adapt(r as ContentRow));
}

/**
 * Fetch a single Home row. `type` accepts the client form ('movie'|'tv') or
 * the DB form ('movie'|'show'|'anime'). `category` matches against
 * `categories[]`. `tag` matches against `search_tags[]`.
 */
export async function sectionFeed(
  supabase: SupabaseClient,
  opts: {
    type?: "movie" | "tv" | DbType;
    category?: string;
    tag?: string;
    limit?: number;
  } = {}
): Promise<AdaptedContent[]> {
  const { type, category, tag, limit = 20 } = opts;
  let q = supabase
    .from("content")
    .select(DB_CONTENT_COLUMNS)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (type === "movie") q = q.eq("type", "movie");
  else if (type === "tv") q = q.in("type", ["show", "anime"]);
  else if (type === "show" || type === "anime") q = q.eq("type", type);
  if (category) q = q.contains("categories", [category]);
  if (tag) q = q.contains("search_tags", [tag]);
  const { data } = await q;
  return (data ?? []).map((r) => adapt(r as ContentRow));
}

export async function contentById(
  supabase: SupabaseClient,
  id: string
): Promise<AdaptedContent | null> {
  // The `id` param may be a uuid (our primary path) OR a numeric tmdb_id
  // (legacy URL). Try uuid first, then fall back to tmdb_id.
  const uuidLike = /^[0-9a-f-]{36}$/i.test(id);
  if (uuidLike) {
    const { data } = await supabase
      .from("content")
      .select(DB_CONTENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    return data ? adapt(data as ContentRow) : null;
  }
  const n = Number(id);
  if (Number.isFinite(n)) {
    const { data } = await supabase
      .from("content")
      .select(DB_CONTENT_COLUMNS)
      .eq("tmdb_id", n)
      .eq("is_hidden", false)
      .maybeSingle();
    return data ? adapt(data as ContentRow) : null;
  }
  return null;
}

export async function searchContent(
  supabase: SupabaseClient,
  query: string,
  limit = 40
): Promise<AdaptedContent[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { data } = await supabase
    .from("content")
    .select(DB_CONTENT_COLUMNS)
    .eq("is_hidden", false)
    .or(`name.ilike.%${q.replace(/[,()]/g, " ")}%,search_tags.cs.{${q}}`)
    .limit(limit);
  return (data ?? []).map((r) => adapt(r as ContentRow));
}

export interface SeasonHeader {
  id: string;
  season_number: number;
  name: string | null;
  poster_image: string | null;
}

export async function seasonsFor(
  supabase: SupabaseClient,
  contentId: string
): Promise<SeasonHeader[]> {
  const { data } = await supabase
    .from("seasons")
    .select("id,season_number,name,poster_image")
    .eq("content_id", contentId)
    .order("season_number", { ascending: true });
  return (data ?? []) as SeasonHeader[];
}

export interface EpisodeRow {
  id: string;
  season_id: string;
  episode_number: number;
  name: string | null;
  description: string | null;
  thumbnail_image: string | null;
  duration_sec: number | null;
  hash_key: string | null;
  intro_start_sec: number | null;
  intro_end_sec: number | null;
  recap_end_sec: number | null;
  outro_start_sec: number | null;
}

export async function episodesForSeason(
  supabase: SupabaseClient,
  seasonId: string
): Promise<EpisodeRow[]> {
  const { data } = await supabase
    .from("episodes")
    .select("*")
    .eq("season_id", seasonId)
    .order("episode_number", { ascending: true });
  return (data ?? []) as EpisodeRow[];
}

export async function episodesForContentSeason(
  supabase: SupabaseClient,
  contentId: string,
  seasonNumber: number
): Promise<EpisodeRow[]> {
  const { data: s } = await supabase
    .from("seasons")
    .select("id")
    .eq("content_id", contentId)
    .eq("season_number", seasonNumber)
    .maybeSingle();
  if (!s) return [];
  return episodesForSeason(supabase, (s as { id: string }).id);
}
