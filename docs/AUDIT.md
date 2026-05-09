# Covenant — Security & Quality Audit Report

**Audit tarihi**: 2026-04-17
**Kapsam**: Solana/Anchor programı (`programs/covenant/`), Next.js 14 web app (`app/`), TypeScript SDK (`sdk/`), integration testleri (`tests/`)
**Branch**: `claude/kind-bassi` — origin/main ile senkron
**Araçlar**: `cargo audit 0.22.1`, `yarn audit`, manuel code review

> ⚠️ Bu rapor, üretim öncesi elle yapılan incelemeye dayanmaktadır. Otomatik fuzzer/statik analiz (Soteria, `cargo-geiger`, Semgrep) çalıştırılmamıştır. Profesyonel bir penetration test / üçüncü taraf audit'in (ör. OtterSec, Neodyme, Halborn) yerine geçmez.

---

## Status update — on-chain settlement refactor (post-audit)

The two structural findings (**C-01 custodial drain** ve **H-02 web app
bypasses Anchor**) were **resolved** by a v1.1 refactor that wires
every fund-moving lifecycle step directly into the on-chain Anchor
program. Highlights:

- `lib/program-server.ts` (yeni): server-side bot helpers
  (`botCreateJob` / `botAcceptJob` / `botSubmitWork` / `botFinalizePayment`)
  + `fetchJobEscrow`, `verifyTxInvokedCovenant`. Server only ever signs
  with a bot's own keypair, never with the deployer key on behalf of
  another user.
- `lib/anchor-browser.ts`: extended with `acceptJobOnChain`,
  `raiseDisputeOnChain`, `resolveDisputeOnChain`, `cancelJobOnChain`
  (createJob/submitWork/finalizePayment already existed).
- `lib/escrow.ts` + `lib/client-escrow.ts`: the four custodial helpers
  (`lockFundsInEscrow`, `releaseFundsToTaker`, `refundToPoster`,
  `buildEscrowLockTransaction`) are now throwing stubs with a
  migration message. Only `mintTestUSDC` (test mint authority — a
  legitimate authority key, not a custody key) and `getTokenBalance`
  remain functional.
- `/api/jobs` POST, `/api/jobs/[id]/finalize`, `/api/jobs/[id]/dispute`,
  `/api/jobs/[id]/cancel`, `/api/jobs/[id]/submit`,
  `/api/disputes/[id]/resolve`, `/api/cron/finalize` — all rewritten
  to verify on-chain tx signatures and mirror the on-chain `JobEscrow`
  state into the DB. None of them call the deployer keypair to move
  user USDC.
- `/api/escrow/build` and `/api/escrow/confirm` — return **410 Gone**
  with a migration note pointing at `/api/jobs` and the on-chain
  client.
- Demo routes (battle/run, arena/run, arena/fulfill, autonomous/run,
  agents/hire) keep their narrative event streams but no longer move
  USDC. Real settlement should run through the standard /api/jobs
  pipeline — `botCreateJob` is the bot-side equivalent for head-less
  agents.
- README updated with the "Fully On-Chain Settlement" section + a
  copy-paste example of the human-user create-job flow.

Together with the previously merged audit fixes (#24 C-03, #25 H-01,
#26 H-03, #27 C-04, #28 M-01, #30 H-05, plus C-02's wallet-auth
foundation in #26), this leaves only architectural follow-ups in
**H-04** (distributed rate limiter) and **H-06** (Anchor 0.31 / Solana
1.20 SDK bump) as open audit items. Everything else has been closed.

---

## Yönetici Özeti

| Severity | Sayı |
|---|---|
| **Critical** | 4 |
| **High** | 6 |
| **Medium** | 7 |
| **Low** | 5 |
| **Info** | 4 |

**Ana risk**: Web uygulaması, Anchor programındaki PDA-bazlı escrow'u **kullanmıyor**. Bunun yerine tüm kullanıcı USDC'leri **tek bir merkezi wallet** (`Gy5cU3bNH1DKsff6rp91H1BmtEfwspziR52WfmMVfbPZ`) içinde toplanıyor ve sunucu kendi elindeki `DEPLOYER_KEYPAIR` ile fonları hareket ettiriyor. API katmanında ise **tek bir cüzdan imza doğrulaması bile yok** — tüm auth, POST body'deki `wallet` string'ine güveniyor. Bu mimari, belirli akışlarda **ortaklaşa tutulan escrow havuzunun tamamen boşaltılmasına** imkân verir.

**Solana programı kendi başına değerlendirildiğinde** iyi yapılandırılmış: PDA seeds, `has_one`/`constraint` check'leri, SPL CPI için signer seeds, `checked_add/sub` ile overflow koruması doğru. Tek kritik program-level bulgusu `raise_dispute` içinde bond mint'in escrow mint'i ile kısıtlanmaması.

---

## Bulgular

### CRITICAL

#### C-01 — Merkezi custodial escrow + imza doğrulaması yok → fon çalma
- **Kapsam**: `app/lib/constants.ts:28`, `app/lib/escrow.ts:84-116`, `app/app/api/disputes/[id]/resolve/route.ts:47-71`
- **Detay**: `ESCROW_WALLET` yorumu açıkça söylüyor: *"For v1 this is the deployer wallet itself — practical, matches the existing server-side release logic"*. Tüm `create_job` akışları kullanıcı USDC'sini tek bir sunucu cüzdanına kilitliyor. Dispute resolution (`POST /api/disputes/[id]/resolve`) `arbitratorWallet` body parametresine güveniyor — **imza kanıtı istenmiyor**. Whitelist'te olan arbitrator adresleri `.env` üzerinden set ediliyor ve `COVENANT_ARBITRATORS` on-chain config'den de okunabildiği için **public bilgi**. İki farklı arbitrator adresi ile iki ayrı POST atan saldırgan threshold'u geçer; sunucu `releaseFundsToTaker(attackerTaker, fullAmount)` çağırarak **havuzdaki başka kullanıcıların fonlarını** saldırganın cüzdanına transfer eder.
- **Saldırı senaryosu**: (1) Saldırgan 1 USDC'lik fake bir iş oluşturur (kendisi poster ve taker), (2) submit_work, (3) `POST /api/disputes` ile kendi kendine dispute açar (aşağıdaki C-02 nedeniyle posterWallet spoof edilebilir), (4) iki kez `POST /api/disputes/[id]/resolve` ile `FavorTaker` sonucu kaydettirir, (5) sunucu havuzdan rastgele miktarı saldırganın ATA'sına gönderir. Eğer `releaseFundsToTaker` job amount'una bakmıyor / başka jobs'un lock'larını topladığı bir single pool ise, tüm havuz boşaltılır.
- **Öneri (rapor kapsamı)**: API katmanında her yetkili eylem için **Solana imza doğrulaması** (`nacl.sign.detached.verify` + nonce/challenge flow) zorunlu; v1 için web app'in Anchor programını direkt çağırması — sunucu custody path'ini kaldırmak.

#### C-02 — POST `/api/disputes` ve `/api/disputes/[id]/resolve` wallet spoofing
- **Kapsam**: `app/app/api/disputes/route.ts:55-161`, `app/app/api/disputes/[id]/resolve/route.ts:32-73`
- **Detay**: Her iki route da `posterWallet` / `arbitratorWallet` string'ini request body'den okuyup string-equality check yapıyor (`job.posterWallet !== posterWallet`, `ARBITRATORS.includes(arbitratorWallet)`). Wallet adresleri kamuya açık; saldırgan herhangi bir iş için dispute başlatabilir veya arbitrator adına oy verebilir. Mevcut kodda `txHash` parametresi de **doğrulanmıyor** — herhangi bir rastgele on-chain imza kabul ediliyor.
- **Öneri**: Her state-mutating endpoint için (message/nonce + signature) tuple'ı doğrulayan bir middleware.

#### C-03 — `/api/admin/route.ts` fail-open auth
- **Kapsam**: `app/app/api/admin/route.ts:7-13`
  ```ts
  const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (ADMIN_SECRET) { /* bearer check */ }
  ```
- **Detay**: Eğer `ADMIN_SECRET` ve `CRON_SECRET` her ikisi de unset ise **check tamamen atlanır** ve endpoint tüm `jobs`, `profiles`, `reputations`, `submissions` kayıtlarını herkese döndürür. Fail-safe olması gerekirken fail-open.
- **Öneri**: `if (!ADMIN_SECRET || auth !== 'Bearer ' + ADMIN_SECRET) return 401`.

#### C-04 — `/api/escrow/confirm` tx doğrulaması zayıf
- **Kapsam**: `app/app/api/escrow/confirm/route.ts:110-138`
- **Detay**: Client-signed path yalnızca `connection.getTransaction(sig)` ile işlemin **var olduğunu** ve revert olmadığını kontrol ediyor. Tx içindeki instruction'lar **parse edilmiyor**: (a) transferin gerçekten USDC olduğu, (b) miktarın `amount` ile eşleştiği, (c) source'un `posterWallet`, destination'ın `ESCROW_WALLET`'ın ATA'sı olduğu, (d) tx'in daha önce başka bir iş için kullanılmamış olduğu (replay) kontrol edilmiyor. Saldırgan devnet'teki rastgele bir confirmed tx hash'i gönderip sahte bir Job kaydı yaratabilir ve C-01 ile birleştirerek havuzdan para çekebilir.
- **Öneri**: Tx'in `compiledInstructions`'ını parse et, SPL `Transfer` instruction'unu birebir doğrula, `Job` tablosuna `txHash` üzerinden unique constraint koy (replay'i DB'de blokla).

---

### HIGH

#### H-01 — Anchor programı: `raise_dispute` bond mint kısıtlanmamış
- **Kapsam**: `programs/covenant/src/instructions/raise_dispute.rs:44` — `pub token_mint: Box<Account<'info, Mint>>`
- **Detay**: Poster `raise_dispute` çağrısında istediği herhangi bir mint'i geçebilir. `min_bond >= bond` kontrolü bond_token_account'un atomik birimlerini kullanır; başka bir mint'in 1 atomik birimi escrow mint'in `min_bond_absolute` değerinin çok altında bir ekonomik değer temsil edebilir. Aşağıdaki iki etki:
  - (a) Grief / DoS: Bond mint ≠ escrow mint olduğunda, `resolve_dispute` içindeki `bond_token_account → taker_token_account` transfer çağrısı mint mismatch nedeniyle başarısız olur; dispute **çözülemez**, job fonları kilitli kalır.
  - (b) Ekonomi kırılımı: Worthless token ile bond trivially geçilir; 24 saatlik dispute window'u doğru çalışsa bile, saldırgan taker'ı sıfıra yakın maliyetle taciz edebilir.
- **Öneri**: `constraint = token_mint.key() == job_escrow.token_mint @ CovError::MintMismatch`.

#### H-02 — Merkezileştirilmiş kripto mimari (genel)
- **Kapsam**: `app/lib/escrow.ts`, `app/lib/constants.ts:22-30`
- **Detay**: README "optimistic settlement on Solana" / "PDA escrow" vaat etse de web app custodial çalışıyor. Yorum satırı (`constants.ts:26`) "A follow-up moves escrow into a per-job PDA owned by the Anchor program" diyor — bu follow-up yapılmamış. Kullanıcılar README'ye dayanarak trust-minimized bir ürün kullandıklarını düşünürken fonları tek bir sunucu cüzdanına teslim ediyor. **Yanıltıcı marketing + SPOF**.
- **Öneri**: Frontend'i `@coral-xyz/anchor` client ile `create_job` instruction'una bağla; `releaseFundsToTaker` yerine `finalize_payment` on-chain çağrısına crank at.

#### H-03 — `/api/keys` API key'leri imza olmadan oluşturuluyor
- **Kapsam**: `app/app/api/keys/route.ts:26-65`
- **Detay**: POST body'de herhangi bir `wallet` adresi geçirerek o cüzdan adına API key yaratılabilir. Rate limit yok. Bu key'ler muhtemelen agent çalıştırmada (x402 payments vs) kullanılıyor → başkasının adına pahalı API çağrıları tetikleme.
- **Öneri**: Sadece imzalı istek veya mevcut bir session/cookie ile erişime izin ver.

#### H-04 — Rate limiter serverless'ta etkisiz
- **Kapsam**: `app/lib/rateLimit.ts` — in-memory `Map` + `setInterval`
- **Detay**: Vercel fonksiyonları stateless. Her container fresh bir `Map` ile başladığı için rate limit per-container uygulanır. `setInterval` cleanup hot fonksiyonlar dışında hiç çalışmaz; sıcak kalırsa memory'de sonsuz birikir. Faucet (`/api/faucet`) saatte 1 limiti pratikte atlatılabilir — devnet'te maliyet küçük, mainnet'te ciddi.
- **Öneri**: Redis (Vercel KV / Upstash) veya DB tabanlı distributed rate limiter.

#### H-05 — Bağımlılık güvenlik açıkları (yarn audit — 11 High / 4 Moderate)
| Paket | Severity | Not |
|---|---|---|
| `next` (14.2.35) | High | DoS via RSC deserialization, DoS via Server Components |
| `defu` (walletconnect chain) | High | Prototype pollution |
| `effect` (indirect) | High | AsyncLocalStorage context contamination |
| `glob` | High | Command injection via `-c/--cmd` CLI (projeye etkisi **sadece** glob CLI kullanımında) |
| `bigint-buffer` (spl-token) | High | Buffer overflow — **patch yok**, upstream bekleniyor |
| `@anthropic-ai/sdk` | Moderate | Memory tool path traversal (kullanılıyorsa) |
| `next` | Moderate×3 | Image Optimizer DoS, rewrites request smuggling, image disk cache growth |
- **Öneri**: `yarn upgrade next@^14.2.45` (en son patch'li minor), `@anthropic-ai/sdk` güncelle; `bigint-buffer` için upstream'i izle.

#### H-06 — Bağımlılık güvenlik açıkları (cargo audit — 2 vuln)
| Crate | ID | Severity |
|---|---|---|
| `curve25519-dalek 3.2.1` | RUSTSEC-2024-0344 | Timing variability in `Scalar29::sub`/`Scalar52::sub` — Solana 1.18.26 tarafından dolaylı olarak çekiliyor |
| `ed25519-dalek 1.0.1` | RUSTSEC-2022-0093 | Double Public Key Signing Function Oracle Attack |
- **Not**: Her ikisi de Solana 1.18 SDK'sından geliyor; program BPF ortamında derlendiğinden runtime etkisi sınırlı olabilir ama client-side kod (`tests`, `scripts`) etkilenir.
- **Öneri**: Anchor 0.31+ ve Solana 1.20+'a upgrade planı; bu sürüm pin'leri güncel dalek crate'lerine taşıyor.

---

### MEDIUM

#### M-01 — Program ID mismatch (3 yerde farklı)
- **Kapsam**:
  - `programs/covenant/src/lib.rs:21` → `AJAJPkC8oRsVaSYgVh36TKbMKZtzn8kKHcQXwZEn2vrQ`
  - `Anchor.toml:6` + `README.md:61` → `5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT`
  - `app/lib/constants.ts:4` → `5hstj5...`
  - `.env.example:43` → `AJAJPk...`
- **Detay**: `declare_id!` ile deploy edilen program ID farklı olunca Anchor client `ProgramError::InvalidProgramId` verir. README kullanıcıları explorer'da yanlış program ID'yi görür; support debug zorlaşır.
- **Öneri**: Tek kaynaktan türet, hepsini senkronize et.

#### M-02 — `resolve_dispute` job_escrow hesabını close etmiyor
- **Kapsam**: `programs/covenant/src/instructions/resolve_dispute.rs:29-34`
- **Detay**: `finalize_payment` `close = poster` ile PDA'yı kapatırken `resolve_dispute` kapatmıyor. Resolved işler rent-locked kalıyor, poster'a rent iade olmuyor. Security açısından sıfır-etkili; UX/ekonomi açısından küçük bir sızıntı.
- **Öneri**: `close = poster` ekle.

#### M-03 — Admin rotate yolu yok
- **Kapsam**: `programs/covenant/src/instructions/update_arbitrators.rs`
- **Detay**: `ProtocolConfig.admin` immutable (rotate instruction yok). Admin key'i kaybedilirse arbitrator listesi donar. Mainnet'te critical olur.
- **Öneri**: `update_admin(ctx, new_admin)` ekle (mevcut admin imzalı).

#### M-04 — `cancel_job` path_a gereksiz reputation PDA yaratıyor
- **Kapsam**: `programs/covenant/src/instructions/cancel_job.rs:49-56, 124-137`
- **Detay**: Open state'deki iptal path_a, `job.taker == Pubkey::default()` olduğu halde hâlâ `init_if_needed` ile `reputation[Pubkey::default()]` PDA'sını açıyor. jobs_failed artırımı sadece path_b'de ama rent boşa yanıyor.
- **Öneri**: `taker_reputation`'ı path_b'ye özgü `Option<Account>` yap veya `taker == default` iken skip et.

#### M-05 — `create_job` escrow_token_account PDA değil
- **Kapsam**: `programs/covenant/src/instructions/create_job.rs:28-34`
- **Detay**: `escrow_token_account` random keypair ile init ediliyor (PDA değil). `finalize_payment` / `cancel_job` bu hesabı sadece `owner == job_escrow.key()` + `mint == job_escrow.token_mint` ile doğruluyor — PDA'ya karşılık gelen belirli bir ATA değil, teknik olarak job_escrow authority'li BAŞKA bir TA da geçirilebilir. Saldırgan, aynı authority+mint'li boş bir TA yaratıp `finalize` çağrısında onu verirse TX atomik şekilde fail olur (transfer 0'ı aşar), fund loss yok. **DoS riski minimal**.
- **Öneri**: `escrow_token_account`'ı PDA yap, `seeds = [b"escrow", job_escrow.key().as_ref()]`.

#### M-06 — Test kapsamı çok dar
- **Kapsam**: `tests/covenant.ts` — 9 test, yaklaşık 400 satır
- **Eksik negatif senaryolar**:
  - Unauthorized taker accept, spec hash mismatch
  - FavorTaker / Split dispute resolution (yalnızca FavorPoster test edilmiş)
  - Cancel path_b (deadline miss by taker)
  - Double-finalize attempt
  - Çifte onay (aynı arbitrator iki kez oy)
  - Bond mint mismatch (H-01'i yakalamaz)
  - Overflow durumlari (max u64 amount)
- **Öneri**: Her instruction için en az 1 negatif test; branch coverage hedefi.

#### M-07 — Console.log'lar & info leak
- **Kapsam**: `app/app/api/**/*.ts` — yaygın `console.error` + bazı `console.log`'lar yolda sensitive data (wallet addresses, tx hashes, error detayları) production log'una dökülüyor
- **Detay**: `escrow/confirm:200` `[escrow/confirm] escrowAta reported by client: ...`, `escrow/confirm:136` tx hash log'u. Vercel log'ları team üyelerine açık. Ayrıca `scripts/vanity-*.mjs` içinde key log'u var.
- **Öneri**: Production-grade logger (pino/winston) + seviye filtresi. Scripts'i `.gitignore`'a alma veya arşivle.

---

### LOW

#### L-01 — `create_job` amount alt sınırı yok
- `amount > 0` geçer; 1 atomic unit USDC ile spam job'lar yaratılabilir. Rent DoS değil (poster kendisi öder) ama UI/DB boşa şişer.

#### L-02 — `deadline` üst sınırı yok
- Poster deadline = i64::MAX yapabilir. Taker ebediyen submit edebilir. Self-grief.

#### L-03 — Self-accept izni (poster == taker)
- `accept_job` taker kimliğini kısıtlamıyor. Poster kendi işini kabul edebilir, reputation grinding. Design choice ise dokümante edilmeli.

#### L-04 — `bond_to_taker` dead variable
- `resolve_dispute.rs:162-216` içinde hesaplanıp sonra `let _ = bond_to_taker;` ile atılıyor. Refactoring artığı; okuyucu kafasını karıştırır.

#### L-05 — Dispute reasonText DB'de plaintext
- `app/app/api/disputes/route.ts:136` → `reasonText: reasonText.trim()` Prisma'ya plaintext yazılıyor ama `reasonHash` ayrıca SHA-256 olarak saklanıyor. Hash on-chain için yeterli; DB'de plaintext tutmak PII leak riski taşıyabilir.

---

### INFO / Best Practices

#### I-01 — `.gitignore` `.env` doğru ignore ediyor (✅)
- Grep sonucunda kök dizinde gerçek secret bulunmadı; yalnızca `.env.example` placeholder'lar.

#### I-02 — `overflow-checks = true` release profile'da açık (✅)
- `Cargo.toml` release profile'da overflow check açık, iyi practice.

#### I-03 — Dispute approval bitmask tasarımı iyi
- `DisputeInfo.approval_mask` 1 byte + `record_approval` mantığı doğru.

#### I-04 — `msg!` ile verbose logging (on-chain)
- Program `msg!()` ile detaylı log basıyor; compute unit maliyeti. Mainnet'e geçerken gereksiz log'ları azalt.

---

## Öneri Yol Haritası (Öncelik Sırası)

1. **Hemen**: C-03 fail-open auth fix; C-02 için tüm mutating endpoint'lere imza doğrulaması middleware; `/api/keys` auth.
2. **1 hafta**: C-01 / H-02 mimari değişiklik — web app'i Anchor programı ile entegre et, custodial wallet kaldır.
3. **Aynı sprint**: H-01 bond mint kısıtlaması; M-01 program ID sync; M-02 close directive; H-05/H-06 dep upgrades.
4. **Önümüzdeki sprint**: M-06 negatif test coverage; H-04 distributed rate limiter; M-03 admin rotation.
5. **Mainnet öncesi**: Profesyonel üçüncü taraf audit (OtterSec / Neodyme / Halborn) + fuzz testing (trident-rs, xray).

---

## Metodoloji Notları

- **Build**: `cargo build` / `anchor build` / `yarn build` bu audit kapsamında **çalıştırılmadı** (node_modules yüklü değildi, tam build yapmak audit sürecini uzatırdı). `cargo audit` resolve edilen dependency tree üzerinden çalıştı, `yarn audit` `yarn.lock` üzerinden çalıştı.
- **TypeScript typecheck**: `tsc --noEmit` denendi; `node_modules` mevcut olmadığı için meaningful değildi — CI'da koşulmalı.
- **Kapsam dışında**: Frontend XSS (React auto-escape var), SSRF'i dış çağrılarda (fal.ai, Helius) rastgele örnekledim ama comprehensive değil. Prisma injection riski raw query kullanılmadığı için düşük; tüm sorgular parameterized Prisma Client.
- **Test edilmedi**: Exploit'lerin canlı PoC'si (devnet deneme).

---

*Rapor sonu.*
