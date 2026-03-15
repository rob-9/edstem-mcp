// EdStem API type definitions (reverse-engineered from the Ed API)

export interface EdUser {
  id: number;
  role: string;
  name: string;
  email: string;
  username: string | null;
  avatar: string | null;
  activated: boolean;
  created_at: string;
  course_role: string | null;
}

export interface EdCourseRole {
  user_id: number;
  course_id: number;
  role: string;
  tutorial: unknown;
  digest: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface EdCourseEnrollment {
  course: EdCourse;
  role: EdCourseRole;
}

export interface EdCourse {
  id: number;
  realm_id: number;
  code: string;
  name: string;
  year: string;
  session: string;
  status: string;
  features: Record<string, boolean>;
  created_at: string;
}

export interface EdUserResponse {
  courses: EdCourseEnrollment[];
  user: EdUser;
}

export interface EdThread {
  id: number;
  user_id: number;
  course_id: number;
  editor_id: number;
  accepted_id: number | null;
  duplicate_id: number | null;
  number: number;
  type: string;
  title: string;
  content: string;
  document: string;
  category: string;
  subcategory: string;
  subsubcategory: string;
  flag_count: number;
  star_count: number;
  view_count: number;
  unique_view_count: number;
  vote_count: number;
  reply_count: number;
  unresolved_count: number;
  is_locked: boolean;
  is_pinned: boolean;
  is_private: boolean;
  is_endorsed: boolean;
  is_answered: boolean;
  is_student_answered: boolean;
  is_staff_answered: boolean;
  is_archived: boolean;
  is_anonymous: boolean;
  is_megathread: boolean;
  anonymous_comments: boolean;
  approved_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  pinned_at: string | null;
  anonymous_id: number;
  answers?: EdComment[];
  comments?: EdComment[];
  user?: { name: string; role: string };
}

export interface EdComment {
  id: number;
  user_id: number;
  course_id: number;
  thread_id: number;
  parent_id: number | null;
  editor_id: number | null;
  number: number;
  type: string;
  kind: string;
  content: string;
  document: string;
  flag_count: number;
  vote_count: number;
  is_endorsed: boolean;
  is_anonymous: boolean;
  is_private: boolean;
  is_resolved: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  anonymous_id: number;
  vote: number;
  comments?: EdComment[];
}

export interface EdThreadUser {
  avatar: string;
  course_role: string;
  id: number;
  name: string;
  role: string;
}

export interface EdGetThreadResponse {
  thread: EdThread;
  users: EdThreadUser[];
}

export interface EdListThreadsResponse {
  threads: EdThread[];
}

export interface EdPostThreadParams {
  type: string;
  title: string;
  category: string;
  subcategory?: string;
  subsubcategory?: string;
  content: string;
  is_pinned?: boolean;
  is_private?: boolean;
  is_anonymous?: boolean;
  is_megathread?: boolean;
  anonymous_comments?: boolean;
}

export interface EdEditThreadParams {
  type?: string;
  title?: string;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  content?: string;
  is_pinned?: boolean;
  is_private?: boolean;
  is_anonymous?: boolean;
  is_megathread?: boolean;
  anonymous_comments?: boolean;
}

export interface EdActivityItem {
  type: "comment" | "thread";
  value: {
    id: number;
    type: string;
    document: string;
    course_id: number;
    course_name: string;
    course_code: string;
    thread_id?: number;
    thread_title?: string;
    title?: string;
    category?: string;
    thread_category?: string;
    created_at: string;
  };
}

export interface EdFileResponse {
  file: {
    user_id: number;
    id: string;
    filename: string;
    extension: string;
    created_at: string;
  };
}

export interface EdAnalyticsUser {
  id: number;
  name: string;
  email: string;
  role: string;
  course_role: string;
  tutorial: unknown;
}
