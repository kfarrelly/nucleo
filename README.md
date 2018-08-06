# Nucleo.fi
Social banking on the [Stellar network](https://www.stellar.org). [Django](https://www.djangoproject.com/) web app implementation.


![Image of Nucleo Leaderboard](https://media-nucleo.s3.amazonaws.com/preview/leaderboard.png)


## Outstanding tasks
- [x] Integrate Ledger and StellarGuard
- [ ] Allow private profiles with account info hidden to those who don't follow you. If private, user must approve follow requests.
- [ ] Include collapsable orderbook in nc.views.AssetDetailView. Similar look to StellarTerm.
- [ ] Path payments in send.js. Have oninput event for account search box to load Send To account from horizon and determine allowed assets that can be sent (based off assets Send To trusts).
- [ ] nc.models.Portfolio.rank weighting in profile search index, nc.index.ProfileIndex.
- [ ] Retrieve feed activity through Nucleo servers where can enrich data properly with active images, urls, etc. Use built in stream_django enrichment procedures.
- [ ] Complete form validation with error reporting for nc.forms.AccountCreateForm, used when associating Stellar accounts.
- [ ] Better and more explicit error handling from Stellar Horizon calls.
- [ ] User trade history and personalized overall return on assets in portfolio.
- [ ] [Node.js listener](https://github.com/orbitlens/stellar-notifier) that posts to nc.views.FeedActivityCreateView when tx involves an account registered in Nucleo db.
- [ ] Unit tests.


## Roadmap
1. Onboard, onboard, onboard.
2. Become less reliant on StellarTerm for asset related information (i.e. top asset leaderboard list, profile view asset prices in XLM, 24h asset price change). This might require extending their [ticker api](https://github.com/stellarterm/stellarterm/tree/master/api) to incorporate all tokens Nucleo has model instances of in db.
3. Offer users ability to buy XLM with fiat. Likely best way to accomplish this is integrating [Coinbase buy widget](https://buy.coinbase.com/)
