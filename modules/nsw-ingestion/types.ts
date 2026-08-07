export type NswSource = "DA" | "CDC";

export interface NswRawDevelopmentType {
  DevelopmentType?: string;
  [key: string]: unknown;
}

export interface NswRawLot {
  Lot?: string;
  PlanLabel?: string;
  Section?: string;
  [key: string]: unknown;
}

export interface NswRawLocation {
  FullAddress?: string;
  StreetNumber1?: string;
  StreetNumber2?: string;
  StreetName?: string;
  StreetType?: string;
  StreetSuffix?: string;
  Suburb?: string;
  Postcode?: string;
  State?: string;
  X?: string;
  Y?: string;
  Lot?: NswRawLot[];
  [key: string]: unknown;
}

export interface NswRawCouncil {
  CouncilName?: string;
  [key: string]: unknown;
}

/**
 * A single Application record from OnlineDA or OnlineCDC. Fields are sparse in
 * practice (not every field appears on every record) — see SPEC.md §2.3.
 */
export interface NswRawApplication {
  PlanningPortalApplicationNumber: string;
  ApplicationType?: string;
  ApplicationStatus?: string;
  CostOfDevelopment?: number;
  DateLastUpdated: string;
  Council?: NswRawCouncil;
  DevelopmentType?: NswRawDevelopmentType[];
  Location?: NswRawLocation[];
  LodgementDate?: string;
  DeterminationDate?: string;
  [key: string]: unknown;
}

export interface NswApiResponse {
  PageSize: number;
  PageNumber: number;
  TotalPages: number;
  TotalCount: number;
  Application: NswRawApplication[];
}

/**
 * Header-based filters accepted by both OnlineDA and OnlineCDC. See SPEC.md §2.1.
 */
export interface NswApiFilters {
  CouncilName?: string[];
  ApplicationType?: string[];
  DevelopmentCategory?: string[];
  ApplicationStatus?: string[];
  CostOfDevelopmentFrom?: number;
  CostOfDevelopmentTo?: number;
  LodgementDateFrom?: string;
  LodgementDateTo?: string;
  SubmissionDateFrom?: string;
  SubmissionDateTo?: string;
  DeterminationDateFrom?: string;
  DeterminationDateTo?: string;
  PlanningPortalApplicationNumber?: string[];
  CouncilApplicationNumber?: string[];
  ApplicationLastUpdatedFrom?: string;
  ApplicationLastUpdatedTo?: string;
}
