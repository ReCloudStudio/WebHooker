import { describe, expect, it } from "bun:test";
import { htmlToText } from "../server/lib/formatters/helpers";

describe("htmlToText", () => {
  it("strips an HTML table bot comment into clean text", () => {
    const html =
      "Deploying webhooker with <a href=\"https://pages.dev\">Cloudflare Pages</a>.<table><tr><td>Latest commit:</td><td><code>526e6c4</code></td></tr><tr><td>Status:</td><td>✅ Deploy successful!</td></tr><tr><td>Preview URL:</td><td><a href='https://ab622f32.webhooker-2e3.pages/...'>preview</a></td></tr></table>";
    const out = htmlToText(html);
    expect(out).not.toContain("<table>");
    expect(out).not.toContain("<td>");
    expect(out).not.toContain("<a ");
    expect(out).toContain("Latest commit:");
    expect(out).toContain("526e6c4");
    expect(out).toContain("✅ Deploy successful!");
    expect(out).toContain("preview");
  });

  it("passes plain markdown through unchanged", () => {
    const md = "**bold** and `code` and [link](https://example.com)";
    expect(htmlToText(md)).toBe(md);
  });

  it("converts <br> to a newline", () => {
    expect(htmlToText("line one<br>line two")).toBe("line one\nline two");
  });

  it("converts <li> to a bullet", () => {
    expect(htmlToText("<ul><li>first</li><li>second</li></ul>")).toBe("• first\n• second");
  });

  it("decodes entities", () => {
    expect(htmlToText("a &amp; b &lt;tag&gt; &quot;q&quot; &#39;apos&#39;")).toBe(
      "a & b <tag> \"q\" 'apos'",
    );
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
  });
});
