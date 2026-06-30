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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      asset_keyframes: {
        Row: {
          asset_id: string
          clip_embedding: Json | null
          created_at: string
          frame_url: string | null
          id: string
          phash: string | null
          timestamp_sec: number | null
          user_id: string
        }
        Insert: {
          asset_id: string
          clip_embedding?: Json | null
          created_at?: string
          frame_url?: string | null
          id?: string
          phash?: string | null
          timestamp_sec?: number | null
          user_id: string
        }
        Update: {
          asset_id?: string
          clip_embedding?: Json | null
          created_at?: string
          frame_url?: string | null
          id?: string
          phash?: string | null
          timestamp_sec?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_keyframes_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          ahash: string | null
          asset_type: string
          clip_embedding: Json | null
          created_at: string
          description: string | null
          dhash: string | null
          file_size: number | null
          file_url: string | null
          id: string
          image_metadata: Json | null
          mime_type: string | null
          phash: string | null
          sha256: string | null
          status: string
          storage_path: string | null
          tags: string[] | null
          title: string
          user_id: string
        }
        Insert: {
          ahash?: string | null
          asset_type: string
          clip_embedding?: Json | null
          created_at?: string
          description?: string | null
          dhash?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          image_metadata?: Json | null
          mime_type?: string | null
          phash?: string | null
          sha256?: string | null
          status?: string
          storage_path?: string | null
          tags?: string[] | null
          title: string
          user_id: string
        }
        Update: {
          ahash?: string | null
          asset_type?: string
          clip_embedding?: Json | null
          created_at?: string
          description?: string | null
          dhash?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          image_metadata?: Json | null
          mime_type?: string | null
          phash?: string | null
          sha256?: string | null
          status?: string
          storage_path?: string | null
          tags?: string[] | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      case_evidence: {
        Row: {
          case_id: string
          content: string | null
          created_at: string
          evidence_type: string
          id: string
          metadata: Json | null
          source_url: string | null
          user_id: string
        }
        Insert: {
          case_id: string
          content?: string | null
          created_at?: string
          evidence_type: string
          id?: string
          metadata?: Json | null
          source_url?: string | null
          user_id: string
        }
        Update: {
          case_id?: string
          content?: string | null
          created_at?: string
          evidence_type?: string
          id?: string
          metadata?: Json | null
          source_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enforcement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          asset_id: string
          certificate_number: string
          id: string
          issued_at: string
          owner_name: string
          user_id: string
        }
        Insert: {
          asset_id: string
          certificate_number: string
          id?: string
          issued_at?: string
          owner_name: string
          user_id: string
        }
        Update: {
          asset_id?: string
          certificate_number?: string
          id?: string
          issued_at?: string
          owner_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_contacts: {
        Row: {
          case_id: string
          contact_type: string
          created_at: string
          id: string
          source_label: string | null
          source_url: string | null
          user_id: string
          value: string
          verified: boolean
        }
        Insert: {
          case_id: string
          contact_type?: string
          created_at?: string
          id?: string
          source_label?: string | null
          source_url?: string | null
          user_id: string
          value: string
          verified?: boolean
        }
        Update: {
          case_id?: string
          contact_type?: string
          created_at?: string
          id?: string
          source_label?: string | null
          source_url?: string | null
          user_id?: string
          value?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "creator_contacts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enforcement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      discovered_matches: {
        Row: {
          ai_score: number | null
          asset_id: string
          channel_name: string | null
          clip_score: number | null
          created_at: string
          dhash_score: number | null
          discovered_phash: string | null
          discovered_via: string | null
          domain: string | null
          fair_use_flag: string | null
          final_confidence_score: number | null
          id: string
          is_owned: boolean
          match_type: string | null
          metadata_score: number | null
          notes: string | null
          original_video_id: string | null
          phash_score: number | null
          platform: string | null
          preview_url: string | null
          result_category: string | null
          risk_level: string | null
          segments_scanned: boolean
          source_url: string
          status: string | null
          user_id: string
          video_id: string | null
          video_title: string | null
          violation_category: string | null
        }
        Insert: {
          ai_score?: number | null
          asset_id: string
          channel_name?: string | null
          clip_score?: number | null
          created_at?: string
          dhash_score?: number | null
          discovered_phash?: string | null
          discovered_via?: string | null
          domain?: string | null
          fair_use_flag?: string | null
          final_confidence_score?: number | null
          id?: string
          is_owned?: boolean
          match_type?: string | null
          metadata_score?: number | null
          notes?: string | null
          original_video_id?: string | null
          phash_score?: number | null
          platform?: string | null
          preview_url?: string | null
          result_category?: string | null
          risk_level?: string | null
          segments_scanned?: boolean
          source_url: string
          status?: string | null
          user_id: string
          video_id?: string | null
          video_title?: string | null
          violation_category?: string | null
        }
        Update: {
          ai_score?: number | null
          asset_id?: string
          channel_name?: string | null
          clip_score?: number | null
          created_at?: string
          dhash_score?: number | null
          discovered_phash?: string | null
          discovered_via?: string | null
          domain?: string | null
          fair_use_flag?: string | null
          final_confidence_score?: number | null
          id?: string
          is_owned?: boolean
          match_type?: string | null
          metadata_score?: number | null
          notes?: string | null
          original_video_id?: string | null
          phash_score?: number | null
          platform?: string | null
          preview_url?: string | null
          result_category?: string | null
          risk_level?: string | null
          segments_scanned?: boolean
          source_url?: string
          status?: string | null
          user_id?: string
          video_id?: string | null
          video_title?: string | null
          violation_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discovered_matches_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovered_matches_original_video_id_fkey"
            columns: ["original_video_id"]
            isOneToOne: false
            referencedRelation: "original_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      enforcement_cases: {
        Row: {
          asset_id: string | null
          channel_url: string | null
          created_at: string
          id: string
          match_id: string | null
          notes: string | null
          page_description: string | null
          page_title: string | null
          platform: string | null
          risk_level: string | null
          screenshot_url: string | null
          status: string
          subject_name: string | null
          target_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_id?: string | null
          channel_url?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          notes?: string | null
          page_description?: string | null
          page_title?: string | null
          platform?: string | null
          risk_level?: string | null
          screenshot_url?: string | null
          status?: string
          subject_name?: string | null
          target_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_id?: string | null
          channel_url?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          notes?: string | null
          page_description?: string | null
          page_title?: string | null
          platform?: string | null
          risk_level?: string | null
          screenshot_url?: string | null
          status?: string
          subject_name?: string | null
          target_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enforcement_cases_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_cases_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "discovered_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      identities: {
        Row: {
          created_at: string
          handle: string
          id: string
          platform: string
          status: string
          url: string | null
          user_id: string
          verification_token: string
        }
        Insert: {
          created_at?: string
          handle: string
          id?: string
          platform: string
          status?: string
          url?: string | null
          user_id: string
          verification_token?: string
        }
        Update: {
          created_at?: string
          handle?: string
          id?: string
          platform?: string
          status?: string
          url?: string | null
          user_id?: string
          verification_token?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      original_videos: {
        Row: {
          channel_name: string | null
          created_at: string
          description: string | null
          id: string
          owned_account_id: string | null
          phash: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          upload_date: string | null
          url: string
          user_id: string
          video_id: string
        }
        Insert: {
          channel_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owned_account_id?: string | null
          phash?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          upload_date?: string | null
          url: string
          user_id: string
          video_id: string
        }
        Update: {
          channel_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owned_account_id?: string | null
          phash?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          upload_date?: string | null
          url?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "original_videos_owned_account_id_fkey"
            columns: ["owned_account_id"]
            isOneToOne: false
            referencedRelation: "owned_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      owned_accounts: {
        Row: {
          channel_id: string | null
          created_at: string
          display_name: string
          handle: string | null
          id: string
          is_verified: boolean
          notes: string | null
          platform: string
          updated_at: string
          url: string
          user_id: string
          verification_source: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          display_name: string
          handle?: string | null
          id?: string
          is_verified?: boolean
          notes?: string | null
          platform: string
          updated_at?: string
          url: string
          user_id: string
          verification_source?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          display_name?: string
          handle?: string | null
          id?: string
          is_verified?: boolean
          notes?: string | null
          platform?: string
          updated_at?: string
          url?: string
          user_id?: string
          verification_source?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_segments: {
        Row: {
          clip_score: number | null
          confidence: number
          created_at: string
          deep_link: string | null
          detection_method: string
          end_seconds: number
          face_score: number | null
          frame_count: number
          frame_screenshot_url: string | null
          id: string
          match_id: string
          match_type: string | null
          notes: string | null
          ocr_score: number | null
          phash_score: number | null
          start_seconds: number
          user_id: string
        }
        Insert: {
          clip_score?: number | null
          confidence?: number
          created_at?: string
          deep_link?: string | null
          detection_method?: string
          end_seconds: number
          face_score?: number | null
          frame_count?: number
          frame_screenshot_url?: string | null
          id?: string
          match_id: string
          match_type?: string | null
          notes?: string | null
          ocr_score?: number | null
          phash_score?: number | null
          start_seconds: number
          user_id: string
        }
        Update: {
          clip_score?: number | null
          confidence?: number
          created_at?: string
          deep_link?: string | null
          detection_method?: string
          end_seconds?: number
          face_score?: number | null
          frame_count?: number
          frame_screenshot_url?: string | null
          id?: string
          match_id?: string
          match_type?: string | null
          notes?: string | null
          ocr_score?: number | null
          phash_score?: number | null
          start_seconds?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_segments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "discovered_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      violations: {
        Row: {
          asset_id: string | null
          confidence_score: number | null
          detected_at: string
          evidence_url: string | null
          id: string
          infringing_url: string
          match_id: string | null
          notes: string | null
          platform: string
          similarity_score: number | null
          status: string
          threat_level: string
          updated_at: string
          user_id: string
          violation_type: string | null
        }
        Insert: {
          asset_id?: string | null
          confidence_score?: number | null
          detected_at?: string
          evidence_url?: string | null
          id?: string
          infringing_url: string
          match_id?: string | null
          notes?: string | null
          platform: string
          similarity_score?: number | null
          status?: string
          threat_level?: string
          updated_at?: string
          user_id: string
          violation_type?: string | null
        }
        Update: {
          asset_id?: string | null
          confidence_score?: number | null
          detected_at?: string
          evidence_url?: string | null
          id?: string
          infringing_url?: string
          match_id?: string | null
          notes?: string | null
          platform?: string
          similarity_score?: number | null
          status?: string
          threat_level?: string
          updated_at?: string
          user_id?: string
          violation_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "violations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "discovered_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      warning_emails: {
        Row: {
          approved_at: string | null
          body: string
          case_id: string
          created_at: string
          deadline_hours: number
          fair_use_flag: string | null
          id: string
          recipient_email: string
          risk_level: string | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          body: string
          case_id: string
          created_at?: string
          deadline_hours?: number
          fair_use_flag?: string | null
          id?: string
          recipient_email: string
          risk_level?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          body?: string
          case_id?: string
          created_at?: string
          deadline_hours?: number
          fair_use_flag?: string | null
          id?: string
          recipient_email?: string
          risk_level?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warning_emails_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enforcement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
