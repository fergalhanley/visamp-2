import { flushAnalytics } from "@/lib/analytics/server";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({}, { status: 401 });
  const delivered = await flushAnalytics();
  return Response.json({ delivered });
}
