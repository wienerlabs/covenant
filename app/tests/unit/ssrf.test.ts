/**
 * Unit tests for lib/ssrf — SSRF guard (C-093).
 *
 * Covers private/loopback/link-local/CGNAT/metadata ranges, numeric-encoded
 * IPv4 bypasses, IPv6 forms, and DNS-rebinding via an injected resolver.
 *
 * Run with:  npx tsx --test tests/unit/ssrf.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isPrivateIPv4,
  isPrivateIPv6,
  isBlockedIp,
  parseLooseIPv4,
  checkUrlSync,
  assertPublicUrl,
} from "../../lib/ssrf";

describe("isPrivateIPv4", () => {
  test("blocks private / loopback / reserved ranges", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "10.255.255.255",
      "127.0.0.1",
      "169.254.169.254", // cloud metadata
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1", // CGNAT
      "224.0.0.1", // multicast
      "255.255.255.255",
    ]) {
      assert.equal(isPrivateIPv4(ip), true, `${ip} should be private`);
    }
  });
  test("allows public addresses", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "172.15.255.255", "172.32.0.1", "100.63.255.255", "93.184.216.34"]) {
      assert.equal(isPrivateIPv4(ip), false, `${ip} should be public`);
    }
  });
  test("fails closed on malformed", () => {
    assert.equal(isPrivateIPv4("999.1.1.1"), true);
    assert.equal(isPrivateIPv4("1.2.3"), true);
  });
});

describe("parseLooseIPv4 (numeric-encoded bypasses)", () => {
  test("decodes decimal / hex / octal / short forms to dotted-quad", () => {
    assert.equal(parseLooseIPv4("2130706433"), "127.0.0.1"); // decimal
    assert.equal(parseLooseIPv4("0x7f000001"), "127.0.0.1"); // hex
    assert.equal(parseLooseIPv4("0177.0.0.1"), "127.0.0.1"); // octal first octet
    assert.equal(parseLooseIPv4("127.1"), "127.0.0.1"); // short form
    assert.equal(parseLooseIPv4("1.1.1.1"), "1.1.1.1");
  });
  test("returns null for real hostnames", () => {
    assert.equal(parseLooseIPv4("example.com"), null);
    assert.equal(parseLooseIPv4("api.openai.com"), null);
  });
});

describe("isPrivateIPv6", () => {
  test("blocks loopback / unspecified / ULA / link-local / mapped", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1"]) {
      assert.equal(isPrivateIPv6(ip), true, `${ip} should be private`);
    }
  });
  test("allows public IPv6", () => {
    assert.equal(isPrivateIPv6("2606:4700:4700::1111"), false);
    assert.equal(isPrivateIPv6("2001:4860:4860::8888"), false);
  });
});

describe("isBlockedIp", () => {
  test("blocks non-IP input (fail closed)", () => {
    assert.equal(isBlockedIp("not-an-ip"), true);
  });
  test("classifies v4 + v6", () => {
    assert.equal(isBlockedIp("10.0.0.1"), true);
    assert.equal(isBlockedIp("1.1.1.1"), false);
    assert.equal(isBlockedIp("::1"), true);
    assert.equal(isBlockedIp("2606:4700::1111"), false);
  });
});

describe("checkUrlSync", () => {
  test("rejects internal / private targets", () => {
    const blocked = [
      "http://localhost/",
      "http://127.0.0.1/",
      "http://10.0.0.5/admin",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/", // cloud metadata
      "http://[::1]/",
      "http://2130706433/", // decimal 127.0.0.1
      "http://0x7f000001/", // hex 127.0.0.1
      "http://service.internal/",
      "http://db.local/",
    ];
    for (const url of blocked) {
      assert.equal(checkUrlSync(url).ok, false, `${url} should be blocked`);
    }
  });

  test("rejects non-http(s) protocols and embedded credentials", () => {
    assert.equal(checkUrlSync("ftp://example.com/").ok, false);
    assert.equal(checkUrlSync("file:///etc/passwd").ok, false);
    assert.equal(checkUrlSync("javascript:alert(1)").ok, false);
    assert.equal(checkUrlSync("http://user:pass@example.com/").ok, false);
    assert.equal(checkUrlSync("not a url").ok, false);
  });

  test("allows public http(s) URLs", () => {
    for (const url of ["https://example.com/", "http://1.1.1.1/", "https://api.openai.com/v1/chat"]) {
      assert.equal(checkUrlSync(url).ok, true, `${url} should be allowed`);
    }
  });
});

describe("assertPublicUrl (DNS rebinding)", () => {
  test("allows a hostname that resolves to a public address", async () => {
    const r = await assertPublicUrl("https://example.com/hook", {
      resolve: async () => ["93.184.216.34"],
    });
    assert.equal(r.ok, true);
  });

  test("blocks a hostname that resolves to a private address (rebinding)", async () => {
    const r = await assertPublicUrl("https://evil.example.com/", {
      resolve: async () => ["127.0.0.1"],
    });
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /blocked address/);
  });

  test("blocks when any resolved address is private", async () => {
    const r = await assertPublicUrl("https://mixed.example.com/", {
      resolve: async () => ["1.1.1.1", "10.0.0.1"],
    });
    assert.equal(r.ok, false);
  });

  test("blocks when the host does not resolve", async () => {
    const r = await assertPublicUrl("https://nope.example.com/", {
      resolve: async () => [],
    });
    assert.equal(r.ok, false);
  });

  test("blocks when resolution throws", async () => {
    const r = await assertPublicUrl("https://err.example.com/", {
      resolve: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    assert.equal(r.ok, false);
  });

  test("short-circuits the sync block without resolving", async () => {
    let resolved = false;
    const r = await assertPublicUrl("http://127.0.0.1/", {
      resolve: async () => {
        resolved = true;
        return ["1.1.1.1"];
      },
    });
    assert.equal(r.ok, false);
    assert.equal(resolved, false);
  });
});
