export type AssignrHalPage = {
  page?: number;
  pages?: number;
  count?: number;
};

export type AssignrGame = {
  id: string | number;
  start_time?: string;
  end_time?: string;
  localized_date?: string;
  localized_time?: string;
  age_group?: string;
  home_team?: string;
  away_team?: string;
  league?: string;
  status?: string;
  subvenue?: string;
  lock_version?: string | number;
  is_public?: string | boolean;
  league_id?: string | number;
  _embedded?: {
    venue?: {
      id?: string | number;
      name?: string;
    };
    league?: {
      id?: string | number;
      name?: string;
    };
    assignments?: AssignrAssignment[];
  };
  [key: string]: string | number | boolean | object | undefined | null;
};

export type AssignrAssignment = {
  id?: string | number;
  sort_order?: number;
  status?: string;
  position?: string;
  position_abbreviation?: string;
  accepted?: boolean;
  declined?: boolean;
  assigned?: boolean;
  lock_version?: string | number;
  _embedded?: {
    official?: AssignrOfficial;
    position?: {
      id?: string | number;
      name?: string;
    };
  };
  [key: string]: string | number | boolean | object | undefined | null;
};

export type AssignrOfficial = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  email?: string;
  official?: boolean;
  assignor?: boolean;
  observer?: boolean;
  [key: string]: string | number | boolean | object | undefined | null;
};

export type AssignrUser = AssignrOfficial & {
  mi?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  home_phone?: string;
  work_phone?: string;
  mobile_phone?: string;
  home_phone_is_public?: boolean;
  work_phone_is_public?: boolean;
  mobile_phone_is_public?: boolean;
  date_of_birth?: string;
};

export type AssignrStatement = {
  id?: string | number;
  status?: string;
  total?: number | string;
  created_at?: string;
  updated_at?: string;
  _embedded?: {
    official?: AssignrOfficial;
  };
  [key: string]: string | number | boolean | object | undefined | null;
};

export type AssignrListResponse<TKey extends string, TItem> = {
  _embedded?: Record<TKey, TItem[]>;
  page?: AssignrHalPage;
};

export type AssignrGameCreatePayload = {
  localized_date?: string;
  localized_time?: string;
  date_time?: string;
  venue_id?: number;
  venue_name?: string;
  subvenue?: string;
  home_team_id?: number;
  home_team_name?: string;
  away_team_id?: number;
  away_team_name?: string;
  age_group_id?: number;
  age_group_name?: string;
  league_id?: number;
  league_name?: string;
  game_type_name?: string;
  pattern_name?: string;
  gender_name?: string;
  paid_via?: string;
  status?: string;
  is_public?: string;
  public_note_text?: string;
  private_note_text?: string;
  user_defined_id?: string;
  external_id?: number;
};

export type AssignrGameUpdatePayload = AssignrGameCreatePayload & {
  lock_version?: string | number;
};

export type AssignrUserUpdatePayload = {
  first_name?: string;
  last_name?: string;
  mi?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  home_phone?: string;
  work_phone?: string;
  mobile_phone?: string;
  home_phone_is_public?: boolean;
  work_phone_is_public?: boolean;
  mobile_phone_is_public?: boolean;
  date_of_birth?: string;
  official?: boolean;
  assignor?: boolean;
  observer?: boolean;
};

export type AssignrAssignmentConfirmPayload = {
  status: "A" | "D";
  reason?: string;
};
