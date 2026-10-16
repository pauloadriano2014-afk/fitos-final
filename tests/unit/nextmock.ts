export const NextResponse = { json: (body: any, init?: any) => ({ body, status: init?.status ?? 200 }) };
