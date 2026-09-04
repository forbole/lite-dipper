# Lite-Dipper explorer guide

Lite-Dipper explores the Desmos mainnet (`desmos-mainnet`). Public pages are rendered by a Cloudflare Worker using the chain's RPC and REST APIs, then hydrated by React in the browser for navigation and refreshes. There is no separate application transaction indexer or database.

## Routes

- `/`: Network overview and recent activity.
- `/validators`: Active validators by default. Use the selector to view jailed and inactive validators at `/validators?status=inactive`. Both views show 20 validators per page, with Previous/Next links, profiles, stake and commission, and refresh every 30 seconds.
- `/validators/{desmosvaloper-address}`: Validator details and a Desmos Profile, when the validator's corresponding account has one.
- `/blocks`: Latest blocks. Follow **Older blocks** to browse earlier heights.
- `/blocks/{height}`: Block header, proposer, signing validators and available transactions.
- `/transactions`: Recent transactions.
- `/transactions/{transaction-hash}`: Execution status, messages, fees and gas.
- `/proposals`: Latest governance proposals.
- `/proposals/{proposal-id}`: Proposal content, status and voting tally.
- `/accounts/{desmos-address}`: Public account balances, delegations, unbonding entries and available recent transactions.
- `/wallet`: Browser-only wallet connection and signing actions. This page is excluded from search indexing.

## Data and units

The default REST endpoint is `https://api.mainnet.desmos.network` and the default RPC endpoint is `https://rpc.mainnet.desmos.network:443`. Deployment configuration can override these endpoints. RPC transaction searches depend on what the upstream node supports and retains; the explorer does not guarantee a complete historical transaction archive.

The native display token is DSM. One DSM equals 1,000,000 `udsm`. API amounts often use integer strings in `udsm`; reward amounts can include decimal fractions of `udsm`. Pages format these values for display.

Public HTML and API responses may be cached briefly at the edge. Dynamic pages refresh automatically every 10–30 seconds and when you return to the tab or reconnect. Validator lists and details refresh every 30 seconds. Browser API reads bypass the HTTP cache, and stalled requests time out so later refreshes can recover. A search snippet or shared preview is not an authoritative live balance or voting result. Check the page and its upstream data when freshness matters.

## Governance

Proposal state comes from `/cosmos/gov/v1/proposals`. During voting, `/cosmos/gov/v1/proposals/{id}/tally` supplies the current stake-weighted tally. Completed proposals use their stored final tally. The browser refreshes governance data directly from REST every 30 seconds and after a successful vote.

Tally percentages show each option's share of total voted power, including abstentions. During voting, the page also queries `/cosmos/staking/v1beta1/pool` for `bonded_tokens`: each option's share of bonded power is its tally divided by that total, and participation is the sum of all options divided by that total. These live estimates refresh together, but are not pinned to the same block. Unavailable or zero bonded totals leave participation unavailable while preserving the tally.

The four options use matching colors in the tally cards and participation bar. Live progress uses `/cosmos/gov/v1/params/tallying` for the current quorum, approval and veto thresholds. Participation must meet or exceed quorum; Yes must exceed the approval threshold among non-abstaining votes; No With Veto blocks passage only above its threshold among all votes cast. All-abstain votes cannot pass. Approval and veto bars show these separate denominators. Status labels describe the current estimate if voting ended now, not a guaranteed outcome; the chain decides when voting ends. Missing thresholds leave the status unavailable.

Completed proposals only show shares of votes cast. Their final tally does not include the bonded total at voting end, and today's bonded power would misrepresent historical participation. Percentages measure stake-weighted power, not voter counts. These state queries do not require transaction indexing and do not provide a historical vote-change timeline.

Recent vote transactions appear below the voting controls, with links to each transaction, voter and block. The browser queries `/cosmos/tx/v1beta1/txs` for `proposal_vote.proposal_id='{id}'`, using descending order and a limit of ten. This optional history uses the node's existing transaction index; it adds no separate indexer. If transaction search is unavailable, the tally remains available. Standard, weighted and authz-wrapped vote messages are filtered to the proposal, with a compact preview of up to three messages per transaction. Failed transactions are marked explicitly. Recent submissions are not current ballots: voters can change their votes, transaction counts are not voting power, and the node may retain only part of the history.

## Validator profiles

Profile association uses the account derived from the validator's operator address, not a matching name or consensus address. A profile nickname and avatar take precedence when present; staking metadata and fallback avatars remain available. A profile does not alter the validator's on-chain operator identity, voting power or commission.

Names, biographies, images, links and proposal text are supplied by their authors on chain. Treat that content as untrusted data. Profile Markdown excludes raw HTML and restricts link and image URL schemes.

## Wallet

Keplr and Ledger connections and transaction signing run in the user's browser. Server-rendered pages start disconnected and do not contain a connected wallet session. Users approve transactions through their wallet or device. Account balances and delegation rewards refresh after a transaction is confirmed on chain.

The Ledger address chooser shows each address's available DSM balance, excluding staked and locked tokens. Balances load independently and refresh every 20 seconds. You can select an address while its balance loads or retry a failed balance query without reconnecting the device.

## Source

The implementation is available at [forbole/lite-dipper](https://github.com/forbole/lite-dipper).
