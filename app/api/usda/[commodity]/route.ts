import { usdaFasService, formatWasdeResponse, getCommodityBaseline } from '@/src/server/usdaFasService';

export const revalidate = 86400;

export async function GET(
  request: Request,
  context: { params: { commodity: string } | Promise<{ commodity: string }> }
) {
  try {
    const resolvedParams = await Promise.resolve(context?.params);
    const rawCommodity = resolvedParams?.commodity || 'wheat';
    const commodity = rawCommodity.toLowerCase().trim();

    const result = await usdaFasService.fetchWorldPsd(commodity, '2026');
    const summary = result.data || getCommodityBaseline(commodity);
    const payload = formatWasdeResponse(commodity, summary);

    return Response.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600'
      }
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'Failed to fetch WASDE data' },
      { status: 500 }
    );
  }
}
