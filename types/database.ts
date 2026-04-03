export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      active_sessions: {
        Row: {
          created_at: string | null
          current_tmdb_id: number | null
          current_type: Database["public"]["Enums"]["content_type"] | null
          device_id: string
          device_name: string | null
          device_type: Database["public"]["Enums"]["device_type"] | null
          id: string
          ip_address: string | null
          is_streaming: boolean | null
          last_active: string | null
          profile_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_tmdb_id?: number | null
          current_type?: Database["public"]["Enums"]["content_type"] | null
          device_id: string
          device_name?: string | null
          device_type?: Database["public"]["Enums"]["device_type"] | null
          id?: string
          ip_address?: string | null
          is_streaming?: boolean | null
          last_active?: string | null
          profile_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_tmdb_id?: number | null
          current_type?: Database["public"]["Enums"]["content_type"] | null
          device_id?: string
          device_name?: string | null
          device_type?: Database["public"]["Enums"]["device_type"] | null
          id?: string
          ip_address?: string | null
          is_streaming?: boolean | null
          last_active?: string | null
          profile_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          added_at: string | null
          id: string
          is_featured: boolean | null
          tags: string[] | null
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string | null
        }
        Insert: {
          added_at?: string | null
          id?: string
          is_featured?: boolean | null
          tags?: string[] | null
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          updated_at?: string | null
        }
        Update: {
          added_at?: string | null
          id?: string
          is_featured?: boolean | null
          tags?: string[] | null
          tmdb_id?: number
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      content_metadata: {
        Row: {
          completion_threshold: number | null
          created_at: string | null
          credits_start: number | null
          episode_number: number | null
          id: string
          next_episode_prompt: number | null
          season_number: number | null
          skip_intro_end: number | null
          skip_intro_start: number | null
          skip_recap_end: number | null
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
        }
        Insert: {
          completion_threshold?: number | null
          created_at?: string | null
          credits_start?: number | null
          episode_number?: number | null
          id?: string
          next_episode_prompt?: number | null
          season_number?: number | null
          skip_intro_end?: number | null
          skip_intro_start?: number | null
          skip_recap_end?: number | null
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
        }
        Update: {
          completion_threshold?: number | null
          created_at?: string | null
          credits_start?: number | null
          episode_number?: number | null
          id?: string
          next_episode_prompt?: number | null
          season_number?: number | null
          skip_intro_end?: number | null
          skip_intro_start?: number | null
          skip_recap_end?: number | null
          tmdb_id?: number
          type?: Database["public"]["Enums"]["content_type"]
        }
        Relationships: []
      }
      content_requests: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          fulfilled_at: string | null
          id: string
          poster_path: string | null
          status: Database["public"]["Enums"]["request_status"] | null
          title: string
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string | null
          user_id: string
          vote_count: number | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          fulfilled_at?: string | null
          id?: string
          poster_path?: string | null
          status?: Database["public"]["Enums"]["request_status"] | null
          title: string
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          updated_at?: string | null
          user_id: string
          vote_count?: number | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          fulfilled_at?: string | null
          id?: string
          poster_path?: string | null
          status?: Database["public"]["Enums"]["request_status"] | null
          title?: string
          tmdb_id?: number
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string | null
          user_id?: string
          vote_count?: number | null
        }
        Relationships: []
      }
      home_feed_sections: {
        Row: {
          content_type: Database["public"]["Enums"]["content_type"] | null
          created_at: string | null
          display_order: number
          genre_id: number | null
          id: string
          is_active: boolean | null
          max_items: number | null
          section_type: string
          title: string
          tmdb_ids: number[] | null
        }
        Insert: {
          content_type?: Database["public"]["Enums"]["content_type"] | null
          created_at?: string | null
          display_order?: number
          genre_id?: number | null
          id?: string
          is_active?: boolean | null
          max_items?: number | null
          section_type: string
          title: string
          tmdb_ids?: number[] | null
        }
        Update: {
          content_type?: Database["public"]["Enums"]["content_type"] | null
          created_at?: string | null
          display_order?: number
          genre_id?: number | null
          id?: string
          is_active?: boolean | null
          max_items?: number | null
          section_type?: string
          title?: string
          tmdb_ids?: number[] | null
        }
        Relationships: []
      }
      payment_history: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          invoice_url: string | null
          metadata: Json | null
          payment_method: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          subscription_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          invoice_url?: string | null
          metadata?: Json | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subscription_id?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          invoice_url?: string | null
          metadata?: Json | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subscription_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          autoplay_next: boolean | null
          autoplay_previews: boolean | null
          avatar_url: string | null
          created_at: string | null
          id: string
          is_kids: boolean | null
          language: string | null
          maturity_level: Database["public"]["Enums"]["maturity_level"] | null
          name: string
          pin: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          autoplay_next?: boolean | null
          autoplay_previews?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          is_kids?: boolean | null
          language?: string | null
          maturity_level?: Database["public"]["Enums"]["maturity_level"] | null
          name: string
          pin?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          autoplay_next?: boolean | null
          autoplay_previews?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          is_kids?: boolean | null
          language?: string | null
          maturity_level?: Database["public"]["Enums"]["maturity_level"] | null
          name?: string
          pin?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          rating: Database["public"]["Enums"]["rating_type"]
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          rating: Database["public"]["Enums"]["rating_type"]
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          rating?: Database["public"]["Enums"]["rating_type"]
          tmdb_id?: number
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_votes: {
        Row: {
          created_at: string | null
          id: string
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          ads_free: boolean | null
          can_download: boolean | null
          created_at: string | null
          currency: string | null
          description: string | null
          features: Json | null
          id: string
          max_devices: number
          max_profiles: number
          max_quality: Database["public"]["Enums"]["video_quality"]
          mobile_only: boolean | null
          name: string
          price: number
        }
        Insert: {
          ads_free?: boolean | null
          can_download?: boolean | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          features?: Json | null
          id: string
          max_devices?: number
          max_profiles?: number
          max_quality?: Database["public"]["Enums"]["video_quality"]
          mobile_only?: boolean | null
          name: string
          price: number
        }
        Update: {
          ads_free?: boolean | null
          can_download?: boolean | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          max_devices?: number
          max_profiles?: number
          max_quality?: Database["public"]["Enums"]["video_quality"]
          mobile_only?: boolean | null
          name?: string
          price?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          auto_renew: boolean | null
          cancelled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          payment_method: Json | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_renew?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_method?: Json | null
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_renew?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_method?: Json | null
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      video_sources: {
        Row: {
          created_at: string | null
          duration: number | null
          episode_number: number | null
          file_size: number | null
          id: string
          quality: Database["public"]["Enums"]["video_quality"]
          season_number: number | null
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          url: string
          audio_tracks: Json | null
          subtitle_tracks: Json | null
        }
        Insert: {
          created_at?: string | null
          duration?: number | null
          episode_number?: number | null
          file_size?: number | null
          id?: string
          quality: Database["public"]["Enums"]["video_quality"]
          season_number?: number | null
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          url: string
          audio_tracks?: Json | null
          subtitle_tracks?: Json | null
        }
        Update: {
          created_at?: string | null
          duration?: number | null
          episode_number?: number | null
          file_size?: number | null
          id?: string
          quality?: Database["public"]["Enums"]["video_quality"]
          season_number?: number | null
          tmdb_id?: number
          type?: Database["public"]["Enums"]["content_type"]
          url?: string
          audio_tracks?: Json | null
          subtitle_tracks?: Json | null
        }
        Relationships: []
      }
      watch_progress: {
        Row: {
          completed: boolean | null
          created_at: string | null
          duration_seconds: number
          episode_number: number | null
          id: string
          last_watched: string | null
          profile_id: string
          progress_seconds: number
          season_number: number | null
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          duration_seconds?: number
          episode_number?: number | null
          id?: string
          last_watched?: string | null
          profile_id: string
          progress_seconds?: number
          season_number?: number | null
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          duration_seconds?: number
          episode_number?: number | null
          id?: string
          last_watched?: string | null
          profile_id?: string
          progress_seconds?: number
          season_number?: number | null
          tmdb_id?: number
          type?: Database["public"]["Enums"]["content_type"]
        }
        Relationships: [
          {
            foreignKeyName: "watch_progress_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          added_at: string | null
          id: string
          profile_id: string
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
        }
        Insert: {
          added_at?: string | null
          id?: string
          profile_id: string
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
        }
        Update: {
          added_at?: string | null
          id?: string
          profile_id?: string
          tmdb_id?: number
          type?: Database["public"]["Enums"]["content_type"]
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_reports: {
        Row: {
          id: string
          user_id: string
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          season_number: number | null
          episode_number: number | null
          category: Database["public"]["Enums"]["report_category"]
          description: string | null
          timestamp_seconds: number | null
          resolved: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          tmdb_id: number
          type: Database["public"]["Enums"]["content_type"]
          season_number?: number | null
          episode_number?: number | null
          category: Database["public"]["Enums"]["report_category"]
          description?: string | null
          timestamp_seconds?: number | null
          resolved?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          tmdb_id?: number
          type?: Database["public"]["Enums"]["content_type"]
          season_number?: number | null
          episode_number?: number | null
          category?: Database["public"]["Enums"]["report_category"]
          description?: string | null
          timestamp_seconds?: number | null
          resolved?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_profile_limit: { Args: { p_user_id: string }; Returns: boolean }
      check_stream_limit: { Args: { p_user_id: string }; Returns: boolean }
      save_watch_progress: {
        Args: {
          p_profile_id: string
          p_tmdb_id: number
          p_type: Database["public"]["Enums"]["content_type"]
          p_season_number: number | null
          p_episode_number: number | null
          p_progress_seconds: number
          p_duration_seconds: number
        }
        Returns: Database["public"]["Tables"]["watch_progress"]["Row"]
      }
    }
    Enums: {
      content_type: "movie" | "tv"
      device_type: "mobile" | "tablet" | "tv" | "web" | "desktop"
      maturity_level: "kids" | "teen" | "adult" | "all"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      rating_type: "thumbs_up" | "thumbs_down" | "love"
      request_status: "pending" | "approved" | "added" | "rejected"
      subscription_status: "active" | "cancelled" | "expired" | "paused"
      report_category: "video_quality" | "audio_issue" | "subtitle_issue" | "wrong_content" | "buffering" | "playback_error" | "other"
      video_quality: "480p" | "720p" | "1080p" | "4k"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for easier usage
export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"]
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T]

// Convenience type aliases
export type Profile = Tables<"profiles">
export type Subscription = Tables<"subscriptions">
export type WatchProgress = Tables<"watch_progress">
export type Watchlist = Tables<"watchlist">
export type Rating = Tables<"ratings">
export type ActiveSession = Tables<"active_sessions">
export type ContentRequest = Tables<"content_requests">
export type RequestVote = Tables<"request_votes">
export type Content = Tables<"content">
export type ContentMetadata = Tables<"content_metadata">
export type VideoSource = Tables<"video_sources">
export type VideoReport = Tables<"video_reports">

// Audio and Subtitle track types (now embedded in video_sources as JSONB)
export interface AudioTrack {
  language: string
  label: string
  is_default?: boolean
  is_descriptive?: boolean
}

export interface SubtitleTrack {
  language: string
  label: string
  url: string
  is_default?: boolean
  is_cc?: boolean
  is_forced?: boolean
}
export type HomeFeedSection = Tables<"home_feed_sections">

// Content type enum
export type ContentType = Enums<"content_type">
export type DeviceType = Enums<"device_type">
export type MaturityLevel = Enums<"maturity_level">
export type PaymentStatus = Enums<"payment_status">
export type RatingType = Enums<"rating_type">
export type RequestStatus = Enums<"request_status">
export type SubscriptionStatus = Enums<"subscription_status">
export type ReportCategory = Enums<"report_category">
export type VideoQuality = Enums<"video_quality">
