import { buildTelegramLink, escapeTelegramHtml } from "../../utils/telegramHtml";

describe("telegramHtml", () => {
  test("escapes reserved HTML characters", () => {
    expect(escapeTelegramHtml('Tom & Jerry <"best">')).toBe("Tom &amp; Jerry &lt;&quot;best&quot;&gt;");
  });

  test("escapes link labels and urls for Telegram HTML", () => {
    expect(buildTelegramLink("https://example.com/?a=1&b=2", "A&B <Launch>")).toBe(
      '<a href="https://example.com/?a=1&amp;b=2">A&amp;B &lt;Launch&gt;</a>'
    );
  });
});
