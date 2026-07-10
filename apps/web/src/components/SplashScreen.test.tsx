// GLITCHY (gl11tchy): regression coverage for fork splash branding
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { APP_BASE_NAME } from "../branding";
import { SplashScreen } from "./SplashScreen";

describe("SplashScreen", () => {
  it("uses the shared fork name for accessible splash text", () => {
    const markup = renderToStaticMarkup(<SplashScreen />);

    expect(markup).toContain(`aria-label="${APP_BASE_NAME} splash screen"`);
    expect(markup).toContain(`alt="${APP_BASE_NAME}"`);
    expect(markup).not.toContain("T3 Code");
  });
});
