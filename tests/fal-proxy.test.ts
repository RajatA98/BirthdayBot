import * as proxyRoute from "@/app/api/fal/proxy/route";

describe("/api/fal/proxy", () => {
  it("exports a Next.js POST route handler", () => {
    expect(typeof proxyRoute.POST).toBe("function");
  });

  it("exports a Next.js GET route handler", () => {
    expect(typeof proxyRoute.GET).toBe("function");
  });

  it("exports a Next.js PUT route handler", () => {
    expect(typeof proxyRoute.PUT).toBe("function");
  });
});
