# Business Validation Plan — G-Maiden

> **Goal:** test the riskiest product and business assumptions before committing significant time
> or money. Keep validation local-first, small, and evidence-based.
> **Principle:** validate core value and usability before pricing, distribution, or marketplace work.

## 1. Risky assumptions

| # | Assumption | If false |
| --- | --- | --- |
| **A1** | G-Signal warnings are useful and do not distract players | The core value proposition fails |
| **A2** | Players return because the companion helps them improve | There is no sustained use |
| **A3** | Thai players will pay ฿99–199, and a suitable payment model exists | Revenue assumptions need revision |
| **A4** | Players can install the app, configure GSI, and use it in a real match | Setup friction blocks activation |
| **A5** | A distribution channel can reach the intended audience | Adoption remains too expensive |
| **A6** | Players want community-created companion styles | A marketplace would have no demand |

## 2. Experiments

### E1 — Supervised local usability sessions 🔴 *(A1, A2, A4)*

- Run owner-approved supervised usability sessions with a review build after its acceptance gates pass.
- Keep G-Log and diagnostic data on the test machine. Collect no background analytics or match data.
- Ask separately before recording notes or receiving a manually exported diagnostic bundle.
- Measure setup completion, warning usefulness, false alerts, mute actions, and short-term return intent.
- Use findings to prioritize fixes; this session is not a distribution or release decision.

### E2 — Problem and solution interviews *(A1, A3)*

- Conduct 8–12 interviews with target players.
- Ask how they currently improve, what causes avoidable deaths, whether a warning helps, and what
  they would pay for a trustworthy companion.
- Keep interview notes limited to the stated research purpose.

### E3 — Van Westendorp pricing survey *(A3)*

- Survey at least 100 respondents through suitable Thai gaming communities.
- Ask the four price-sensitivity questions and preferred payment model.
- Report the accepted price range and sampling limitations.

### E4 — Pricing intent page *(A3, A5)*

- Present clearly labeled proposed price options and a non-binding interest action.
- Measure page visits and option interest without collecting match data or implying an available
  purchase.
- Stop the experiment if the page misleads users about current product availability.

### E5 — Distribution comparison *(A5)*

- Compare candidate channels only after install, security, support, and update requirements are ready.
- Measure install completion and support burden using aggregate counts with explicit privacy review.
- Choose a channel from measured friction and reach, not assumed audience size.

### E6 — Marketplace demand check *(A6, after v1.0)*

- Demonstrate a small set of curated companion styles before building marketplace infrastructure.
- Measure actual use and requests to create styles; postpone implementation without clear demand.

## 3. Decision gates

| Gate | Evidence | If it fails |
| --- | --- | --- |
| **G1 — core value** | Useful warnings, manageable false-alert rate, and successful setup in local sessions | Fix G-Signal or setup before pricing work |
| **G2 — willingness to pay** | Pricing survey plus non-binding page intent | Revisit pricing and product packaging |
| **G3 — distribution** | Install completion and support burden for candidate channels | Focus on the channel with lower verified friction |
| **G4 — marketplace** | Repeated requests and demonstrated use of curated styles | Defer marketplace work |

## 4. Financial model

The base case estimates about 125 paid users. At 5% conversion, that implies roughly 2,500 active
users; at 60% activation, about 4,200 installs. E1 measures setup and use, while E3/E4 test whether
the conversion and price assumptions have evidence in the Thai market.

## 5. Privacy and operating limits

- G-Log remains local. Sharing any diagnostic requires a separate, explicit user action.
- Do not add analytics, enrollment records, or account requirements to local usability sessions.
- E2/E3 can begin without a game build; E1 requires a safe, reviewable build and a supervised session.

---

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.1 | 2026-10-18 | Limited proposed usability sessions to owner-approved supervised review builds. |
| 1.0.0 | 2026-10-18 | Replaced distribution-cohort planning with supervised local usability sessions and privacy limits. |
