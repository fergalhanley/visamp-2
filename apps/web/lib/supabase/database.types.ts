export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audio_uploads: {
        Row: {
  id: string; user_id: string; music_artist_id: string; licence_id: string;
  title: string; file_name: string; object_key: string; bytes: number; sha256: string;
  status: string; track_id: string | null; error: string | null;
  created_at: string; started_at: string | null; finished_at: string | null;
}
        Insert: {
          id?: string; user_id: string; music_artist_id: string; licence_id: string;
          title: string; file_name: string; object_key: string; bytes: number; sha256: string;
          status?: string; track_id?: string | null; error?: string | null;
          created_at?: string; started_at?: string | null; finished_at?: string | null;
        }
        Update: {
          status?: string; track_id?: string | null; error?: string | null;
          started_at?: string | null; finished_at?: string | null;
        }
        Relationships: []
      }
      ai_credit_settings: {
        Row: {
          generation_cost: number
          signup_grant: number
          singleton: boolean
          updated_at: string
        }
        Insert: {
          generation_cost?: number
          signup_grant?: number
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          generation_cost?: number
          signup_grant?: number
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      ai_credit_transactions: {
        Row: {
          amount: number
          created_at: string
          generation_request_id: string | null
          id: string
          kind: Database["public"]["Enums"]["ai_credit_transaction_kind"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          generation_request_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ai_credit_transaction_kind"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          generation_request_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ai_credit_transaction_kind"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_transactions_generation_request_id_fkey"
            columns: ["generation_request_id"]
            isOneToOne: true
            referencedRelation: "ai_generation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generation_requests: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          credit_cost: number
          id: string
          ip_hash: string
          status: Database["public"]["Enums"]["ai_generation_request_status"]
          user_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          credit_cost?: number
          id: string
          ip_hash: string
          status?: Database["public"]["Enums"]["ai_generation_request_status"]
          user_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          credit_cost?: number
          id?: string
          ip_hash?: string
          status?: Database["public"]["Enums"]["ai_generation_request_status"]
          user_id?: string
        }
        Relationships: []
      }
      api_rate_limit_state: {
        Row: {
          bucket: string
          identity_hash: string
          request_count: number
          window_started_at: string
        }
        Insert: {
          bucket: string
          identity_hash: string
          request_count: number
          window_started_at: string
        }
        Update: {
          bucket?: string
          identity_hash?: string
          request_count?: number
          window_started_at?: string
        }
        Relationships: []
      }
      app_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          vis_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          vis_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          vis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_vis_id_fkey"
            columns: ["vis_id"]
            isOneToOne: false
            referencedRelation: "visualisations"
            referencedColumns: ["id"]
          },
        ]
      }
      licences: {
        Row: {
          created_at: string
          document_key: string | null
          effective_from: string | null
          effective_until: string | null
          grants_hosting: boolean
          grants_streaming: boolean
          grants_sync: boolean
          grants_transcoding: boolean
          id: string
          music_artist_id: string
          notes: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["licence_status"]
          terminated_at: string | null
          termination_notice_days: number | null
          territory: string
          warrants_master: boolean
          warrants_publishing: boolean
        }
        Insert: {
          created_at?: string
          document_key?: string | null
          effective_from?: string | null
          effective_until?: string | null
          grants_hosting?: boolean
          grants_streaming?: boolean
          grants_sync?: boolean
          grants_transcoding?: boolean
          id?: string
          music_artist_id: string
          notes?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["licence_status"]
          terminated_at?: string | null
          termination_notice_days?: number | null
          territory?: string
          warrants_master?: boolean
          warrants_publishing?: boolean
        }
        Update: {
          created_at?: string
          document_key?: string | null
          effective_from?: string | null
          effective_until?: string | null
          grants_hosting?: boolean
          grants_streaming?: boolean
          grants_sync?: boolean
          grants_transcoding?: boolean
          id?: string
          music_artist_id?: string
          notes?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["licence_status"]
          terminated_at?: string | null
          termination_notice_days?: number | null
          territory?: string
          warrants_master?: boolean
          warrants_publishing?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "licences_music_artist_id_fkey"
            columns: ["music_artist_id"]
            isOneToOne: false
            referencedRelation: "music_artists"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          user_id: string
          vis_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          vis_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          vis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_vis_id_fkey"
            columns: ["vis_id"]
            isOneToOne: false
            referencedRelation: "visualisations"
            referencedColumns: ["id"]
          },
        ]
      }
      music_artists: {
        Row: {
          avatar_key: string | null
          bio: string | null
          claimed_by: string | null
          created_at: string
          id: string
          name: string
          slug: string
          website_url: string | null
        }
        Insert: {
          avatar_key?: string | null
          bio?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          website_url?: string | null
        }
        Update: {
          avatar_key?: string | null
          bio?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          website_url?: string | null
        }
        Relationships: []
      }
      playlist_items: {
        Row: {
          playlist_id: string
          position: number
          vis_id: string
        }
        Insert: {
          playlist_id: string
          position?: number
          vis_id: string
        }
        Update: {
          playlist_id?: string
          position?: number
          vis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_vis_id_fkey"
            columns: ["vis_id"]
            isOneToOne: false
            referencedRelation: "visualisations"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          follower_count: number
          id: string
          total_views: number
          username: string | null
          vis_count: number
        }
        Insert: {
          avatar_path?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          follower_count?: number
          id: string
          total_views?: number
          username?: string | null
          vis_count?: number
        }
        Update: {
          avatar_path?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          follower_count?: number
          id?: string
          total_views?: number
          username?: string | null
          vis_count?: number
        }
        Relationships: []
      }
      track_asset_deletions: {
        Row: {
          attempts: number
          bucket: string
          completed_at: string | null
          created_at: string
          id: number
          last_error: string | null
          object_key: string
          reason: string
          track_id: string
        }
        Insert: {
          attempts?: number
          bucket: string
          completed_at?: string | null
          created_at?: string
          id?: number
          last_error?: string | null
          object_key: string
          reason: string
          track_id: string
        }
        Update: {
          attempts?: number
          bucket?: string
          completed_at?: string | null
          created_at?: string
          id?: number
          last_error?: string | null
          object_key?: string
          reason?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_asset_deletions_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_plays: {
        Row: {
          context: string
          id: number
          listener_hash: string
          played_at: string
          track_id: string
          user_id: string | null
        }
        Insert: {
          context: string
          id?: number
          listener_hash: string
          played_at?: string
          track_id: string
          user_id?: string | null
        }
        Update: {
          context?: string
          id?: number
          listener_hash?: string
          played_at?: string
          track_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "track_plays_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_renditions: {
        Row: {
          bitrate_kbps: number
          bytes: number
          created_at: string
          format: string
          id: string
          is_current: boolean
          object_key: string
          track_id: string
        }
        Insert: {
          bitrate_kbps: number
          bytes: number
          created_at?: string
          format: string
          id?: string
          is_current?: boolean
          object_key: string
          track_id: string
        }
        Update: {
          bitrate_kbps?: number
          bytes?: number
          created_at?: string
          format?: string
          id?: string
          is_current?: boolean
          object_key?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_renditions_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          album: string | null
          artwork_1024_key: string | null
          artwork_512_key: string | null
          bpm: number | null
          created_at: string
          download_allowed: boolean
          duration_ms: number
          genre_tags: string[]
          id: string
          is_explicit: boolean
          isrc: string | null
          licence_id: string | null
          loudness_gain_db: number | null
          loudness_in_lufs: number | null
          master_key: string | null
          master_sha256: string | null
          music_artist_id: string
          musical_key: string | null
          peaks_key: string | null
          play_count: number
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["track_status"]
          title: string
          updated_at: string
          withdrawn_at: string | null
          year: number | null
        }
        Insert: {
          album?: string | null
          artwork_1024_key?: string | null
          artwork_512_key?: string | null
          bpm?: number | null
          created_at?: string
          download_allowed?: boolean
          duration_ms: number
          genre_tags?: string[]
          id?: string
          is_explicit?: boolean
          isrc?: string | null
          licence_id?: string | null
          loudness_gain_db?: number | null
          loudness_in_lufs?: number | null
          master_key?: string | null
          master_sha256?: string | null
          music_artist_id: string
          musical_key?: string | null
          peaks_key?: string | null
          play_count?: number
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["track_status"]
          title: string
          updated_at?: string
          withdrawn_at?: string | null
          year?: number | null
        }
        Update: {
          album?: string | null
          artwork_1024_key?: string | null
          artwork_512_key?: string | null
          bpm?: number | null
          created_at?: string
          download_allowed?: boolean
          duration_ms?: number
          genre_tags?: string[]
          id?: string
          is_explicit?: boolean
          isrc?: string | null
          licence_id?: string | null
          loudness_gain_db?: number | null
          loudness_in_lufs?: number | null
          master_key?: string | null
          master_sha256?: string | null
          music_artist_id?: string
          musical_key?: string | null
          peaks_key?: string | null
          play_count?: number
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["track_status"]
          title?: string
          updated_at?: string
          withdrawn_at?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tracks_licence_id_fkey"
            columns: ["licence_id"]
            isOneToOne: false
            referencedRelation: "licences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracks_music_artist_id_fkey"
            columns: ["music_artist_id"]
            isOneToOne: false
            referencedRelation: "music_artists"
            referencedColumns: ["id"]
          },
        ]
      }
      visualisation_viewers: {
        Row: {
          last_viewed_at: string
          network_hash: string
          viewer_hash: string
          vis_id: string
        }
        Insert: {
          last_viewed_at?: string
          network_hash: string
          viewer_hash: string
          vis_id: string
        }
        Update: {
          last_viewed_at?: string
          network_hash?: string
          viewer_hash?: string
          vis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visualisation_viewers_vis_id_fkey"
            columns: ["vis_id"]
            isOneToOne: false
            referencedRelation: "visualisations"
            referencedColumns: ["id"]
          },
        ]
      }
      visualisations: {
        Row: {
          comment_count: number
          created_at: string
          description: string | null
          fork_count: number
          forked_from_id: string | null
          id: string
          like_count: number
          owner_id: string
          source: string
          thumb_pinned: boolean
          thumb_path: string | null
          thumb_url: string | null
          title: string
          updated_at: string
          uses_audio: boolean
          view_count: number
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          comment_count?: number
          created_at?: string
          description?: string | null
          fork_count?: number
          forked_from_id?: string | null
          id?: string
          like_count?: number
          owner_id: string
          source?: string
          thumb_pinned?: boolean
          thumb_path?: string | null
          thumb_url?: string | null
          title?: string
          updated_at?: string
          uses_audio?: boolean
          view_count?: number
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          comment_count?: number
          created_at?: string
          description?: string | null
          fork_count?: number
          forked_from_id?: string | null
          id?: string
          like_count?: number
          owner_id?: string
          source?: string
          thumb_pinned?: boolean
          thumb_path?: string | null
          thumb_url?: string | null
          title?: string
          updated_at?: string
          uses_audio?: boolean
          view_count?: number
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "visualisations_forked_from_id_fkey"
            columns: ["forked_from_id"]
            isOneToOne: false
            referencedRelation: "visualisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visualisations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_audio_upload: {
        Args: { p_id: string; p_user_id: string; p_artist_id: string; p_licence_id: string; p_title: string; p_file_name: string; p_object_key: string; p_bytes: number; p_sha256: string }
        Returns: string
      }
      claim_audio_upload: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Tables"]["audio_uploads"]["Row"][]
      }
      begin_ai_generation: {
        Args: {
          p_concurrent_limit: number
          p_ip_hash: string
          p_ip_limit: number
          p_request_id: string
          p_user_id: string
          p_user_limit: number
          p_window_seconds: number
        }
        Returns: string
      }
      consume_api_rate_limit: {
        Args: {
          p_bucket: string
          p_identity_hash: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: number
      }
      comments_within_rate_limit: { Args: Record<PropertyKey, never>; Returns: boolean }
      complete_ai_generation: {
        Args: {
          p_attempts: number
          p_request_id: string
          p_status: Database["public"]["Enums"]["ai_generation_request_status"]
        }
        Returns: boolean
      }
      finalize_hosted_track_ingest: {
        Args: {
          p_artwork_1024_key: string
          p_artwork_512_key: string
          p_loudness_gain_db: number
          p_loudness_in_lufs: number
          p_master_key: string
          p_peaks_key: string
          p_renditions: Json
          p_track_id: string
        }
        Returns: undefined
      }
      record_hosted_track_play: {
        Args: {
          p_context: string
          p_listener_hash: string
          p_track_id: string
          p_user_id: string | null
        }
        Returns: boolean
      }
      record_vis_view: {
        Args: {
          p_network_hash: string
          p_viewer_hash: string
          p_vis_id: string
          p_user_id: string | null
        }
        Returns: boolean
      }
      username_available: { Args: { candidate: string }; Returns: boolean }
      withdraw_hosted_track: {
        Args: { p_delete_master?: boolean; p_track_id: string }
        Returns: undefined
      }
    }
    Enums: {
      ai_credit_transaction_kind:
        | "signup_grant"
        | "generation_charge"
        | "refund"
        | "adjustment"
      ai_generation_request_status:
        | "running"
        | "success"
        | "exhausted"
        | "error"
        | "aborted"
      licence_status: "pending" | "active" | "terminated"
      track_status: "ingesting" | "draft" | "live" | "withdrawn"
      visibility: "public" | "private"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_credit_transaction_kind: [
        "signup_grant",
        "generation_charge",
        "refund",
        "adjustment",
      ],
      ai_generation_request_status: [
        "running",
        "success",
        "exhausted",
        "error",
        "aborted",
      ],
      licence_status: ["pending", "active", "terminated"],
      track_status: ["ingesting", "draft", "live", "withdrawn"],
      visibility: ["public", "private"],
    },
  },
} as const
