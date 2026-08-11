import { nodePlaceholderSvg, svgHeaders } from "@/lib/parts/visual-placeholders";

type RouteParams = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-static";

export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  return new Response(nodePlaceholderSvg(slug, searchParams.get("category")), {
    headers: svgHeaders(),
  });
}
