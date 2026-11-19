# Vacation v25 — Scenario-based QA and release gates

Development branch: `vacation-v25-upgrade`. Production branch: confirm GitHub Pages publishing source before merging.

## Non-negotiable regression checks
- [ ] Preserve San Diego, Los Angeles, and Las Vegas city sections; no day tabs.
- [ ] Preserve Google Maps-style place search and screenshot-to-stop extraction.
- [ ] Preserve existing Activity popup, seven-member display, and Splitwise link.
- [ ] Footer app display version increments from v24 to v25 on release.

## Scenario-based tests
| Area | Scenario | Expected result |
| --- | --- | --- |
| Stop tiles | Scroll vertically with finger starting on a tile | Scroll normally; no accidental drag or edit |
| Stop tiles | Tap tile | Open edit panel; date/time on tile remain static |
| Stop tiles | Long press and reorder | Drag begins after hold; order persists and synchronizes |
| Booking | Booking needed | Date/time red; no booking badge or text on tile |
| Booking | Booked or No booking | Date/time green; status text only in editor |
| Weather | Arrival time forecast exists | Show compact arrival-time temperature |
| Weather | Date beyond forecast horizon | Hide temperature; never fabricate forecast |
| Live trip | Mark current stop complete | Next stop rises to top; completed stop collapsible |
| Live trip | Drive near a stop without confirmation | Never automatically mark completed |
| Offline | Load previously cached itinerary offline | Itinerary readable; queued edits sync after reconnection |
| Sync | Two users edit different stops | Both changes persist |
| Sync | Two users edit same stop | Conflict surfaced or resolved without silent overwrite |
| Sync | Commit fails after local edit | Retry pending write; never falsely mark synced |
| Undo | Delete or complete stop accidentally | Restore previous state with undo |
| Backup | Export and restore | Data round-trips with city/order/booking/expenses intact |
| Expenses | Upload receipt with unreadable total | Require manual correction before save |
| Expenses | Same receipt submitted twice | Warn and avoid duplicate |
| Expenses | Different USD and CAD entries | Keep separate in totals and Excel |
| Expenses | Payer missing | Require user selection; do not infer from photo |
| Gas | No verified price API | Show unknown, never invented prices |
| Gas | Location permission denied | Explain limitation; keep itinerary usable |
| Activity | Unauthorized email detected by trusted backend | Append plain `Unauthorized - email` entry with timestamp, admin-only; do not increase signed-in count |
| Performance | Fast scroll and drag on mobile | Target 60 FPS, measure frame drops and long tasks |
| Accessibility | Keyboard, touch, reduced motion | Essential actions usable without hover or animation |

## Security / integration gates
- [ ] Review deployed Firestore rules before permitting writes or logging unauthorized sign-ins.
- [ ] Verify production publishing branch and URL before merge.
- [ ] Confirm weather source supports hourly arrival forecasts and forecast horizon.
- [ ] Confirm gas-price provider and licensing before promising live prices.
- [ ] Confirm receipt extraction provider; require review of extracted data.
- [ ] Test iOS Safari and Android Chrome with real devices if available; simulator alone is insufficient.
- [ ] Do not store GPS history by default; use location only with permission.
- [ ] Never publish credentials or API secrets in repository.
