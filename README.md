# Nucleo.fi
Social banking on the [Stellar network](https://www.stellar.org). [Django](https://www.djangoproject.com/) web app implementation.


![Image of Nucleo Leaderboard](https://media-nucleo.s3.amazonaws.com/preview/leaderboard.png)


## Mantra
Anything financial or transactional, allow Stellar to do the work. Everything else, centralize in our own relational db for easy reference.


## Outstanding tasks
- [x] Integrate Ledger and StellarGuard
- [x] Allow private profiles with account info hidden to those who don't follow you. If private, user must approve follow requests.
- [x] Include collapsable orderbook in nc.views.AssetDetailView. Similar look to StellarTerm.
- [x] Take crypto deposits through [Papaya anchor API](https://apay.io/api).
- [ ] Offer users ability to buy crypto with fiat through [Coinbase buy widget](https://buy.coinbase.com/).
- [ ] Create feed activity for deposits and withdrawals. Use server signed string="deposit"/"withdrawal" in transaction memo sent to Papaya for verification.
- [x] Include user recent activity (from activity feed) in profile section.
- [x] Improve signup flow. 3 step beginning: personalize profile with list of leading profiles to follow, add/create stellar accounts, trust top Stellar assets.
- [ ] Path payments in send.js. Have oninput event for account search box to load Send To account from horizon and determine allowed assets that can be sent (based off assets Send To trusts).
- [ ] Retrieve feed activity through Nucleo servers where can enrich data properly with active images, urls, etc. Use built in stream_django enrichment procedures.
- [ ] Upgrade ingestion of assets by querying Horizon assets endpoint in a scheduled cron. Only create model instances in Nucleo db for those with stellar.toml links.
- [ ] Produce activity score rankings for top 100 assets in Nucleo db instead of relying on StellarTerm (cron as well).
- [ ] Complete form validation with error reporting for nc.forms.AccountCreateForm, used when associating Stellar accounts.
- [ ] Better and more explicit error handling from Stellar Horizon calls.
- [ ] User trade history and personalized overall return on assets in portfolio.
- [ ] Implement [Stellar Notifier](https://github.com/orbitlens/stellar-notifier) to post to nc.views.FeedActivityCreateView when any new Stellar transaction involves an account registered in Nucleo db.
- [ ] Implement [StellarExpertID](https://id.stellar.expert/demo/) and [Cosmic Links](https://cosmic.link/) for external signing of all transactions.
- [ ] Unit tests.
- [ ] Upgrade landing page with top 5 leaders, top 5 assets, and some marketing.


## Roadmap
1. Onboard, onboard, onboard.
2. Become less reliant on StellarTerm for asset related information (i.e. top asset leaderboard list, profile view asset prices in XLM, 24h asset price change). This might require extending [StellarTerm ticker api](https://github.com/stellarterm/stellarterm/tree/master/api) to incorporate all tokens Nucleo has model instances of in db.
3. Offer users ability to buy XLM with fiat. Likely best way to accomplish this is integrating [Coinbase buy widget](https://buy.coinbase.com/).
4. Social media integrations for asset-related news/press releases (Medium, Twitter, etc.).
5. Emphasize the social aspects of Nucleo.fi. To think about: Issuer postings on asset page for updates (Medium-esque), Community ratings system (i.e. 1-5 stars) for Nucleo users to rank assets.
