export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      workouts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workouts']['Insert']>;
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          created_at: string;
          warmup_settings: Json | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
          warmup_settings?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['exercises']['Insert']>;
        Relationships: [];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          workout_id: string | null;
          started_at: string;
          ended_at: string | null;
          next_logged_order: number;
          rest_target_ms: number | null;
          rest_ends_at: string | null;
          rest_paused_remaining_ms: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          workout_id?: string | null;
          started_at?: string;
          ended_at?: string | null;
          next_logged_order?: number;
          rest_target_ms?: number | null;
          rest_ends_at?: string | null;
          rest_paused_remaining_ms?: number | null;
        };
        Update: Partial<Database['public']['Tables']['workout_sessions']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'workout_sessions_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_exercises: {
        Row: {
          id: string;
          workout_id: string;
          exercise_id: string;
          order_index: number;
          default_sets: number;
        };
        Insert: {
          id?: string;
          workout_id: string;
          exercise_id: string;
          order_index: number;
          default_sets?: number;
        };
        Update: Partial<Database['public']['Tables']['workout_exercises']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      session_exercises: {
        Row: {
          id: string;
          workout_session_id: string;
          exercise_id: string;
          order_index: number;
          first_logged_at: string | null;
          logged_order: number | null;
        };
        Insert: {
          id?: string;
          workout_session_id: string;
          exercise_id: string;
          order_index: number;
          first_logged_at?: string | null;
          logged_order?: number | null;
        };
        Update: Partial<Database['public']['Tables']['session_exercises']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'session_exercises_workout_session_id_fkey';
            columns: ['workout_session_id'];
            isOneToOne: false;
            referencedRelation: 'workout_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      app_feedback: {
        Row: {
          id: string;
          user_id: string;
          author_email: string;
          body: string;
          solved: boolean;
          solved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          author_email: string;
          body: string;
          solved?: boolean;
          solved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['app_feedback']['Insert']>;
        Relationships: [];
      };
      session_sets: {
        Row: {
          id: string;
          session_exercise_id: string;
          set_index: number;
          kg: number | null;
          reps: number | null;
          completed: boolean;
        };
        Insert: {
          id?: string;
          session_exercise_id: string;
          set_index: number;
          kg?: number | null;
          reps?: number | null;
          completed?: boolean;
        };
        Update: Partial<Database['public']['Tables']['session_sets']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'session_sets_session_exercise_id_fkey';
            columns: ['session_exercise_id'];
            isOneToOne: false;
            referencedRelation: 'session_exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      session_rest_periods: {
        Row: {
          id: string;
          workout_session_id: string;
          started_at: string;
          ended_at: string | null;
          planned_target_ms: number;
        };
        Insert: {
          id?: string;
          workout_session_id: string;
          started_at: string;
          ended_at?: string | null;
          planned_target_ms: number;
        };
        Update: Partial<Database['public']['Tables']['session_rest_periods']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'session_rest_periods_workout_session_id_fkey';
            columns: ['workout_session_id'];
            isOneToOne: false;
            referencedRelation: 'workout_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      replace_workout_exercises: {
        Args: { p_workout_id: string; p_exercises: Json };
        Returns: undefined;
      };
      add_exercise_to_session: {
        Args: {
          p_session_id: string;
          p_exercise_id: string;
          p_order_index: number;
          p_shift_ids: string[];
          p_shift_orders: number[];
        };
        Returns: Json;
      };
      record_session_exercise_first_log: {
        Args: { p_session_exercise_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
