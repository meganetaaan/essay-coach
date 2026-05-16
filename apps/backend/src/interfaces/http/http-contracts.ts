// Placeholder HTTP boundary for the local MVP. A real server can map these
// handlers to routes without leaking transport concerns into application code.
export interface HttpResponse<T> {
  status: number;
  body: T;
}
