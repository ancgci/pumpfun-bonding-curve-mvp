describe("ATA_RENT_SOL runtime enforcement", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      TELEGRAM_BOT_TOKEN: "123456:token",
      TELEGRAM_CHAT_ID: "123456",
      RPC_URL: "http://mock-rpc",
      SECRET_KEY_JSON: JSON.stringify(new Array(64).fill(1)),
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.resetModules();
  });

  test("throws when ATA strategy is enabled and ATA_RENT_SOL is missing", () => {
    process.env.ENABLE_ATA_EXIT_STRATEGY = "true";
    delete process.env.ATA_RENT_SOL;

    const config = require("../../utils/config");

    expect(() => config.getRuntimeConfig()).toThrow(/ATA_RENT_SOL is missing/i);
    expect(config.validateConfig().errors.some((error: string) => /ATA_RENT_SOL/i.test(error))).toBe(true);
  });

  test("throws when ATA strategy is enabled and ATA_RENT_SOL is non-positive", () => {
    process.env.ENABLE_ATA_EXIT_STRATEGY = "true";
    process.env.ATA_RENT_SOL = "0";

    const config = require("../../utils/config");

    expect(() => config.getRuntimeConfig()).toThrow(/positive number/i);
    expect(config.validateConfig().errors.some((error: string) => /positive number/i.test(error))).toBe(true);
  });

  test("does not enforce ATA_RENT_SOL when ATA strategy is disabled", () => {
    process.env.ENABLE_ATA_EXIT_STRATEGY = "false";
    delete process.env.ATA_RENT_SOL;

    const config = require("../../utils/config");

    expect(() => config.getRuntimeConfig()).not.toThrow();
    expect(config.validateConfig().errors.some((error: string) => /ATA_RENT_SOL/i.test(error))).toBe(false);
  });
});
