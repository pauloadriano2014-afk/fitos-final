export class NextRequest { constructor(public url: string, public init: any = {}) {} async json() { return JSON.parse(this.init.body || '{}'); } }
export const NextResponse = { json: (body: any, init?: any) => ({ body, status: init?.status ?? 200 }) };
