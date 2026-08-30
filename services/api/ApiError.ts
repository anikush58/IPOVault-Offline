export class ApiError extends Error {
  constructor(
    message: string,
    public code: string = "API_ERROR",
    public status: number = 500,
    public rawError?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}
