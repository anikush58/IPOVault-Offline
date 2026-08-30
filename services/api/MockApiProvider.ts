import { MobileApiResponse } from "../../types/api";

export class MockApiProvider {
  public static getMockIPOs(): MobileApiResponse<any[]> {
    return {
      success: true,
      data: [
        {
          id: "MTL",
          companyName: "Mobile Tech Ltd",
          symbol: "MTL",
          priceRange: "100-120",
          offerPrice: 100,
          issueSize: 500,
          openDate: new Date().toISOString(),
          closeDate: new Date(Date.now() + 86400000 * 3).toISOString(),
          status: "OPEN",
          exchange: "NSE",
          gmp: 25,
          estimatedListingPrice: 125,
          gainPercentage: 25.0,
          subscriptionStatus: "3.5x",
          registrar: "KFintech",
          leadManager: "Kotak Mahindra Capital",
        },
        {
          id: "FSI",
          companyName: "Future Systems Inc",
          symbol: "FSI",
          priceRange: "200-250",
          offerPrice: 200,
          issueSize: 1000,
          openDate: new Date(Date.now() + 86400000 * 5).toISOString(),
          closeDate: new Date(Date.now() + 86400000 * 8).toISOString(),
          status: "UPCOMING",
          exchange: "BSE",
          gmp: 45,
          estimatedListingPrice: 245,
          gainPercentage: 22.5,
          subscriptionStatus: "1.2x",
          registrar: "Link Intime",
          leadManager: "ICICI Securities",
        },
      ],
      meta: {
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      },
      error: null,
      timestamp: new Date().toISOString(),
      requestId: "mock_req_1",
    };
  }

  public static getMockStatistics(): MobileApiResponse<any> {
    return {
      success: true,
      data: {
        totalIPOs: 2,
        openIPOs: 1,
        upcomingIPOs: 1,
        closedIPOs: 0,
        listedIPOs: 0,
        averageListingGain: 23.75,
      },
      meta: {},
      error: null,
      timestamp: new Date().toISOString(),
      requestId: "mock_req_stats",
    };
  }
}
