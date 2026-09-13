export enum MetricCategory {
  MARKET = 'MARKET',
  PERFORMANCE = 'PERFORMANCE',
  SUBSCRIPTION = 'SUBSCRIPTION',
  ALLOTMENT = 'ALLOTMENT',
  DATA_QUALITY = 'DATA_QUALITY',
}

export enum AnalyticsTimePeriod {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  QUARTER = 'QUARTER',
  YEAR = 'YEAR',
}

export enum AnalyticsDateAnchor {
  OPEN_DATE = 'OPEN_DATE',
  CLOSE_DATE = 'CLOSE_DATE',
  LISTING_DATE = 'LISTING_DATE',
  CREATED_AT = 'CREATED_AT',
}

export enum AnalyticsQualityStatus {
  COMPLETE = 'COMPLETE',
  PARTIAL = 'PARTIAL',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  UNAVAILABLE = 'UNAVAILABLE',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
}

export enum AnalyticsQualityWarningCode {
  PRICE_BAND_INCOMPLETE = 'PRICE_BAND_INCOMPLETE',
  LISTING_TIMELINE_INCOMPLETE = 'LISTING_TIMELINE_INCOMPLETE',
  SUBSCRIPTION_DATA_UNAVAILABLE = 'SUBSCRIPTION_DATA_UNAVAILABLE',
  ALLOTMENT_SAMPLE_ONLY = 'ALLOTMENT_SAMPLE_ONLY',
  PROVENANCE_INCOMPLETE = 'PROVENANCE_INCOMPLETE',
  SOURCE_HEALTH_DEGRADED = 'SOURCE_HEALTH_DEGRADED',
  DATA_QUALITY_WARNINGS_PRESENT = 'DATA_QUALITY_WARNINGS_PRESENT',
}

export interface MetricContract {
  id: string;
  name: string;
  category: MetricCategory;
  description: string;
  unit: string;
  aggregationType: string;
  availabilityStatus: string;
  sourceModels: string[];
  sourceFields: string[];
  formulaDescription: string;
  nullPolicyDescription: string;
}

export interface AnalyticsFilter {
  from?: string;
  to?: string;
  segment?: 'MAINBOARD' | 'SME';
  exchange?: 'NSE' | 'BSE' | 'BOTH';
  status?: string;
  period?: AnalyticsTimePeriod;
  anchor?: AnalyticsDateAnchor;
  ipoId?: string;
}

// ── Market Analytics Response ────────────────────────────────────────────────
export interface IpoMarketSnapshotDto {
  totalIpos: number;
  openIposCount: number;
  upcomingIposCount: number;
  closedIposCount: number;
  listingSoonIposCount: number;
  withdrawnOrCancelledCount: number;
}

export interface IssueSizeAggregatesDto {
  totalIssueSizeInr: number | null;
  totalFreshIssueSizeInr: number | null;
  totalOfsSizeInr: number | null;
  averageIssueSizeInr: number | null;
  medianIssueSizeInr: number | null;
  freshIssueVsOfsRatio: number | null;
  totalIssueShareCount: number | null;
  totalFreshIssueShareCount: number | null;
  totalOfsShareCount: number | null;
}

export interface IssueSizeDistributionDto {
  minimumIssueSizeInr: number | null;
  maximumIssueSizeInr: number | null;
  averageIssueSizeInr: number | null;
  medianIssueSizeInr: number | null;
  knownIssueSizeCount: number;
  issueSizeCoveragePercentage: number;
}

export interface IssueShareCountCoverageDto {
  knownIssueShareCount: number;
  issueShareCountCoveragePercentage: number;
}

export interface SegmentMarketAnalyticsDto {
  segment: 'MAINBOARD' | 'SME';
  totalIpos: number;
  knownIssueSizeCount: number;
  totalIssueSizeInr: number | null;
  averageIssueSizeInr: number | null;
  medianIssueSizeInr: number | null;
  totalIssueShareCount: number | null;
}

export interface ExchangeListingCountSummaryDto {
  byExchangeClassification: Record<string, number>;
  totalExchangeListingsCount: number;
  explanation: string;
}

export interface IpoMarketTrendPointDto {
  periodKey: string;
  ipoCount: number;
  totalIssueSizeInr: number | null;
  averageIssueSizeInr: number | null;
}

export interface DetailedIpoMarketAnalyticsResponseDto {
  filter: AnalyticsFilter;
  snapshot: IpoMarketSnapshotDto;
  marketSummary: {
    totalIpos: number;
    byStatus: Record<string, number>;
    bySegment: Record<string, number>;
    byExchange: Record<string, number>;
    issueSize: IssueSizeAggregatesDto;
  };
  issueSizeDistribution: IssueSizeDistributionDto;
  issueShareCoverage: IssueShareCountCoverageDto;
  bySegmentDetailed: SegmentMarketAnalyticsDto[];
  byExchangeDetailed: ExchangeListingCountSummaryDto;
  trends: {
    period: AnalyticsTimePeriod;
    anchor: AnalyticsDateAnchor;
    trendPoints: IpoMarketTrendPointDto[];
  };
}

// ── Performance Analytics Response ───────────────────────────────────────────
export interface PriceBandAnalyticsSummaryDto {
  totalIpos: number;
  knownPriceBandCount: number;
  priceBandCoveragePercentage: number;
  averagePriceBandSpreadInr: number | null;
  medianPriceBandSpreadInr: number | null;
  minimumPriceBandSpreadInr: number | null;
  maximumPriceBandSpreadInr: number | null;
  averagePriceBandSpreadPercentage: number | null;
  medianPriceBandSpreadPercentage: number | null;
}

export interface ListingTimelineAnalyticsDto {
  evaluatedIposCount: number;
  evaluatedTimelineCount: number;
  timelineCoveragePercentage: number;
  averageDaysCloseToListing: number | null;
  medianDaysCloseToListing: number | null;
  minimumDaysCloseToListing: number | null;
  maximumDaysCloseToListing: number | null;
  explanation: string;
}

export interface ListingPerformanceAnalyticsSummaryDto {
  evaluatedCount: number;
  knownListingPriceCount: number;
  listingPerformanceSupported: boolean;
  unsupportedMetricReason: string;
}

export interface SegmentPerformanceAnalyticsDto {
  segment: 'MAINBOARD' | 'SME';
  totalIpos: number;
  knownPriceBandCount: number;
  averagePriceBandSpreadInr: number | null;
  medianPriceBandSpreadInr: number | null;
  averagePriceBandSpreadPercentage: number | null;
  medianPriceBandSpreadPercentage: number | null;
  evaluatedTimelineCount: number;
  averageDaysCloseToListing: number | null;
  medianDaysCloseToListing: number | null;
}

export interface DetailedIpoPerformanceAnalyticsResponseDto {
  filter: AnalyticsFilter;
  priceBandSummary: PriceBandAnalyticsSummaryDto;
  listingTimeline: ListingTimelineAnalyticsDto;
  listingPerformance: ListingPerformanceAnalyticsSummaryDto;
  bySegmentDetailed: SegmentPerformanceAnalyticsDto[];
  trends: {
    period: AnalyticsTimePeriod;
    anchor: AnalyticsDateAnchor;
    trendPoints: Array<{
      periodKey: string;
      ipoCount: number;
      averagePriceBandSpreadInr: number | null;
      averageDaysCloseToListing: number | null;
    }>;
  };
}

// ── Subscription Analytics Response ──────────────────────────────────────────
export interface DetailedSubscriptionDemandAnalyticsResponseDto {
  filter: AnalyticsFilter;
  subscriptionSummary: {
    totalIpos: number;
    knownSubscriptionCount: number;
    subscriptionCoveragePercentage: number;
    subscriptionSupported: boolean;
    averageSubscriptionMultiplier: number | null;
    medianSubscriptionMultiplier: number | null;
    unsupportedMetricReason: string;
  };
  categoryWise: {
    supportedCategories: string[];
    knownCategoryCount: number;
    categories: Array<{
      category: string;
      knownCount: number;
      averageSubscriptionMultiplier: number | null;
      medianSubscriptionMultiplier: number | null;
    }>;
    explanation: string;
  };
  bySegmentDetailed: Array<{
    segment: 'MAINBOARD' | 'SME';
    totalIpos: number;
    knownSubscriptionCount: number;
    averageSubscriptionMultiplier: number | null;
    medianSubscriptionMultiplier: number | null;
  }>;
  trends: {
    period: AnalyticsTimePeriod;
    anchor: AnalyticsDateAnchor;
    trendPoints: Array<{
      periodKey: string;
      ipoCount: number;
      averageSubscriptionMultiplier: number | null;
    }>;
  };
}

// ── Allotment Analytics Response ────────────────────────────────────────────
export interface AllotmentOutcomeDistributionDto {
  allottedCount: number;
  partiallyAllottedCount: number;
  notAllottedCount: number;
  positiveOutcomeCount: number;
  definitiveObservationsCount: number;
  observedPositiveAllotmentRatePercentage: number | null;
  fullAllotmentRatePercentage: number | null;
  partialAllotmentRatePercentage: number | null;
  notAllottedRatePercentage: number | null;
}

export interface AllotmentDataQualityCountsDto {
  totalRawObservations: number;
  deduplicatedObservationsCount: number;
  definitiveObservationsCount: number;
  excludedNonDefinitiveCount: number;
  observationCoveragePercentage: number | null;
}

export interface DetailedAllotmentAnalyticsResponseDto {
  filter: AnalyticsFilter;
  summary: {
    dataQuality: AllotmentDataQualityCountsDto;
    outcomes: AllotmentOutcomeDistributionDto;
    disclaimer: string;
  };
  byIpoDetailed: Array<{
    ipoId: string;
    symbol: string | null;
    companyName: string | null;
    marketSegment: 'MAINBOARD' | 'SME' | null;
    dataQuality: AllotmentDataQualityCountsDto;
    outcomes: AllotmentOutcomeDistributionDto;
  }>;
  bySegmentDetailed: Array<{
    segment: 'MAINBOARD' | 'SME';
    dataQuality: AllotmentDataQualityCountsDto;
    outcomes: AllotmentOutcomeDistributionDto;
  }>;
  trends: {
    period: AnalyticsTimePeriod;
    trendPoints: Array<{
      periodKey: string;
      periodStart: string;
      periodEnd: string;
      dataQuality: AllotmentDataQualityCountsDto;
      outcomes: AllotmentOutcomeDistributionDto;
    }>;
  };
  lotRatioMetricStatus: string;
  lotRatioExplanation: string;
}

// ── Data Quality Summary Response ───────────────────────────────────────────
export interface DomainQualitySummaryDto {
  domain: string;
  qualityStatus: AnalyticsQualityStatus;
  completenessPercentage: number;
  knownObservationCount: number;
  missingObservationCount: number;
  explanation: string;
  warnings: AnalyticsQualityWarningCode[];
}

export interface ProvenanceQualitySummaryDto {
  totalEvaluatedFields: number;
  knownProvenanceCount: number;
  missingProvenanceCount: number;
  provenanceCoveragePercentage: number;
}

export interface SourceHealthQualitySummaryDto {
  totalSources: number;
  healthySourcesCount: number;
  degradedSourcesCount: number;
  failedSourcesCount: number;
  sourceHealthCoveragePercentage: number;
}

export interface FreshnessQualitySummaryDto {
  totalEvaluatedIpos: number;
  freshCount: number;
  staleCount: number;
  unknownCount: number;
  freshnessCoveragePercentage: number;
  note: string;
}

export interface QualityGateDistributionDto {
  totalEvaluatedIpos: number;
  passCount: number;
  passWithWarningsCount: number;
  needsReviewCount: number;
  incompleteCount: number;
  qualityGatePassRatePercentage: number;
}

export interface DetailedAnalyticsQualitySummaryResponseDto {
  evaluatedAt: string;
  overallQualityStatus: AnalyticsQualityStatus;
  disclaimer: string;
  domains: {
    market: DomainQualitySummaryDto;
    performance: DomainQualitySummaryDto;
    subscription: DomainQualitySummaryDto;
    allotment: DomainQualitySummaryDto;
  };
  provenance: ProvenanceQualitySummaryDto;
  sourceHealth: SourceHealthQualitySummaryDto;
  freshness: FreshnessQualitySummaryDto;
  qualityGate: QualityGateDistributionDto;
  metricQualityContracts: Array<{
    metricId: string;
    category: string;
    availability: string;
    qualityStatus: AnalyticsQualityStatus;
    completenessPercentage: number;
    freshnessStatus: string;
    provenanceCoveragePercentage: number;
    warnings: AnalyticsQualityWarningCode[];
  }>;
  activeWarnings: AnalyticsQualityWarningCode[];
}

// ── Summary & Discovery Response DTOs ────────────────────────────────────────
export interface AnalyticsSummaryResponseDto {
  evaluatedAt: string;
  market: {
    snapshot: IpoMarketSnapshotDto;
    summary: {
      totalIpos: number;
      byStatus: Record<string, number>;
      bySegment: Record<string, number>;
      byExchange: Record<string, number>;
      issueSize: IssueSizeAggregatesDto;
    };
  };
  performance: {
    priceBandSummary: PriceBandAnalyticsSummaryDto;
    listingPerformance: ListingPerformanceAnalyticsSummaryDto;
  };
  subscription: {
    totalIpos: number;
    knownSubscriptionCount: number;
    subscriptionCoveragePercentage: number;
    subscriptionSupported: boolean;
    averageSubscriptionMultiplier: number | null;
    medianSubscriptionMultiplier: number | null;
    unsupportedMetricReason: string;
  };
  allotment: {
    dataQuality: AllotmentDataQualityCountsDto;
    outcomes: AllotmentOutcomeDistributionDto;
    disclaimer: string;
  };
  qualityStatus: {
    overallStatus: AnalyticsQualityStatus;
    activeWarnings: AnalyticsQualityWarningCode[];
  };
}

export interface AnalyticsMetricDefinitionDto {
  id: string;
  name: string;
  category: MetricCategory;
  description: string;
  unit: string;
  aggregationType: string;
  availabilityStatus: string;
  sourceModels: string[];
  sourceFields: string[];
  formulaDescription: string;
  nullPolicyDescription: string;
}
