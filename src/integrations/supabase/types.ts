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
          content_tags: string[] | null
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
          published_at: string | null
          recency_hours: number | null
          recency_label: string | null
          result_category: string | null
          risk_level: string | null
          segments_scanned: boolean
          source_url: string
          status: string | null
          trending_score: number | null
          user_id: string
          video_id: string | null
          video_title: string | null
          view_count: number | null
          violation_category: string | null
        }
        Insert: {
          ai_score?: number | null
          asset_id: string
          channel_name?: string | null
          clip_score?: number | null
          content_tags?: string[] | null
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
          published_at?: string | null
          recency_hours?: number | null
          recency_label?: string | null
          result_category?: string | null
          risk_level?: string | null
          segments_scanned?: boolean
          source_url: string
          status?: string | null
          trending_score?: number | null
          user_id: string
          video_id?: string | null
          video_title?: string | null
          view_count?: number | null
          violation_category?: string | null
        }
        Update: {
          ai_score?: number | null
          asset_id?: string
          channel_name?: string | null
          clip_score?: number | null
          content_tags?: string[] | null
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
          published_at?: string | null
          recency_hours?: number | null
          recency_label?: string | null
          result_category?: string | null
          risk_level?: string | null
          segments_scanned?: boolean
          source_url?: string
          status?: string | null
          trending_score?: number | null
          user_id?: string
          video_id?: string | null
          video_title?: string | null
          view_count?: number | null
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
      monitoring_profiles: {
        Row: {
          aliases: string[] | null
          asset_id: string | null
          auto_scan: boolean | null
          brand_name: string | null
          created_at: string
          creator_name: string
          id: string
          keywords: string[] | null
          last_scan_at: string | null
          official_instagram_url: string | null
          official_youtube_url: string | null
          original_source_url: string | null
          owner_name: string | null
          platforms: string[] | null
          regional_name: string | null
          scan_frequency: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aliases?: string[] | null
          asset_id?: string | null
          auto_scan?: boolean | null
          brand_name?: string | null
          created_at?: string
          creator_name: string
          id?: string
          keywords?: string[] | null
          last_scan_at?: string | null
          official_instagram_url?: string | null
          official_youtube_url?: string | null
          original_source_url?: string | null
          owner_name?: string | null
          platforms?: string[] | null
          regional_name?: string | null
          scan_frequency?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aliases?: string[] | null
          asset_id?: string | null
          auto_scan?: boolean | null
          brand_name?: string | null
          created_at?: string
          creator_name?: string
          id?: string
          keywords?: string[] | null
          last_scan_at?: string | null
          official_instagram_url?: string | null
          official_youtube_url?: string | null
          original_source_url?: string | null
          owner_name?: string | null
          platforms?: string[] | null
          regional_name?: string | null
          scan_frequency?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_profiles_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
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
      scan_jobs: {
        Row: {
          asset_id: string | null
          candidates_found: number
          completed_at: string | null
          created_at: string
          current_pass: string | null
          duplicates_skipped: number
          error_message: string | null
          id: string
          kind: string
          new_count: number
          passes_done: number
          progress: number
          query: string | null
          started_at: string
          status: string
          total_passes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_id?: string | null
          candidates_found?: number
          completed_at?: string | null
          created_at?: string
          current_pass?: string | null
          duplicates_skipped?: number
          error_message?: string | null
          id?: string
          kind?: string
          new_count?: number
          passes_done?: number
          progress?: number
          query?: string | null
          started_at?: string
          status?: string
          total_passes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_id?: string | null
          candidates_found?: number
          completed_at?: string | null
          created_at?: string
          current_pass?: string | null
          duplicates_skipped?: number
          error_message?: string | null
          id?: string
          kind?: string
          new_count?: number
          passes_done?: number
          progress?: number
          query?: string | null
          started_at?: string
          status?: string
          total_passes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      takedown_cases: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          asset_id: string | null
          assigned_manager: string | null
          case_id: string | null
          certificate_id: string | null
          confirmation_screenshot_url: string | null
          created_at: string
          evidence_urls: Json
          form_fields: Json
          form_url: string | null
          id: string
          infringing_url: string
          legal_declaration: string | null
          match_id: string | null
          matched_at: string | null
          missing_fields: Json
          notes: string | null
          original_url: string | null
          platform: string
          response_deadline: string | null
          rights_owner_email: string | null
          rights_owner_name: string | null
          risk_warnings: string | null
          similarity_score: number | null
          status: Database["public"]["Enums"]["takedown_status"]
          submitted_at: string | null
          takedown_type: Database["public"]["Enums"]["takedown_type"]
          updated_at: string
          user_id: string
          violation_description: string | null
          warning_email_id: string | null
          warning_sent_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          asset_id?: string | null
          assigned_manager?: string | null
          case_id?: string | null
          certificate_id?: string | null
          confirmation_screenshot_url?: string | null
          created_at?: string
          evidence_urls?: Json
          form_fields?: Json
          form_url?: string | null
          id?: string
          infringing_url: string
          legal_declaration?: string | null
          match_id?: string | null
          matched_at?: string | null
          missing_fields?: Json
          notes?: string | null
          original_url?: string | null
          platform: string
          response_deadline?: string | null
          rights_owner_email?: string | null
          rights_owner_name?: string | null
          risk_warnings?: string | null
          similarity_score?: number | null
          status?: Database["public"]["Enums"]["takedown_status"]
          submitted_at?: string | null
          takedown_type: Database["public"]["Enums"]["takedown_type"]
          updated_at?: string
          user_id: string
          violation_description?: string | null
          warning_email_id?: string | null
          warning_sent_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          asset_id?: string | null
          assigned_manager?: string | null
          case_id?: string | null
          certificate_id?: string | null
          confirmation_screenshot_url?: string | null
          created_at?: string
          evidence_urls?: Json
          form_fields?: Json
          form_url?: string | null
          id?: string
          infringing_url?: string
          legal_declaration?: string | null
          match_id?: string | null
          matched_at?: string | null
          missing_fields?: Json
          notes?: string | null
          original_url?: string | null
          platform?: string
          response_deadline?: string | null
          rights_owner_email?: string | null
          rights_owner_name?: string | null
          risk_warnings?: string | null
          similarity_score?: number | null
          status?: Database["public"]["Enums"]["takedown_status"]
          submitted_at?: string | null
          takedown_type?: Database["public"]["Enums"]["takedown_type"]
          updated_at?: string
          user_id?: string
          violation_description?: string | null
          warning_email_id?: string | null
          warning_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "takedown_cases_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takedown_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enforcement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takedown_cases_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takedown_cases_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "discovered_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takedown_cases_warning_email_id_fkey"
            columns: ["warning_email_id"]
            isOneToOne: false
            referencedRelation: "warning_emails"
            referencedColumns: ["id"]
          },
        ]
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
      verify_certificate: {
        Args: { _cert_number: string }
        Returns: {
          asset_sha256: string
          asset_title: string
          asset_type: string
          certificate_number: string
          issued_at: string
          owner_name: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      takedown_status:
        | "not_started"
        | "evidence_missing"
        | "ready"
        | "preparing_form"
        | "waiting_approval"
        | "submitted"
        | "platform_reviewing"
        | "removed"
        | "rejected"
        | "counter_notice"
        | "escalated_legal"
      takedown_type:
        | "youtube_copyright"
        | "youtube_privacy"
        | "youtube_impersonation"
        | "instagram_copyright"
        | "facebook_copyright"
        | "tiktok_copyright"
        | "website_dmca"
        | "hosting_abuse"
        | "google_delisting"
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
      takedown_status: [
        "not_started",
        "evidence_missing",
        "ready",
        "preparing_form",
        "waiting_approval",
        "submitted",
        "platform_reviewing",
        "removed",
        "rejected",
        "counter_notice",
        "escalated_legal",
      ],
      takedown_type: [
        "youtube_copyright",
        "youtube_privacy",
        "youtube_impersonation",
        "instagram_copyright",
        "facebook_copyright",
        "tiktok_copyright",
        "website_dmca",
        "hosting_abuse",
        "google_delisting",
      ],
    },
  },
} as const
