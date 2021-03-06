from django.conf.urls import url

from . import views

app_name = 'nc'
urlpatterns = [
    # User profile
    url(r'^profile/$', views.UserRedirectView.as_view(), name='user-redirect'),
    url(r'^profile/settings/$', views.UserSettingsRedirectView.as_view(), name='user-settings-redirect'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/$', views.UserDetailView.as_view(), name='user-detail'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/update/$', views.UserUpdateView.as_view(), name='user-update'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/settings/update/$', views.UserSettingsUpdateView.as_view(), name='user-settings-update'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/follow/$', views.UserFollowUpdateView.as_view(), name='user-follow'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/follow/request/update/$', views.UserFollowRequestUpdateView.as_view(), name='user-follow-request-update'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/follow/request/delete/$', views.UserFollowRequestDeleteView.as_view(), name='user-follow-request-delete'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/followers/$', views.UserFollowerListView.as_view(), name='user-follower-list'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/following/$', views.UserFollowingListView.as_view(), name='user-following-list'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/portfolio/data/$', views.UserPortfolioDataListView.as_view(), name='user-portfolio-data-list'),

    # Associated Stellar account
    url(r'^account/create/$', views.AccountCreateView.as_view(), name='account-create'),
    url(r'^account/fund/request/create/$', views.AccountFundRequestCreateView.as_view(), name='account-fund-request-create'),
    url(r'^account/(?P<slug>[\w.@+-]+)/update/$', views.AccountUpdateView.as_view(), name='account-update'),
    url(r'^account/(?P<slug>[\w.@+-]+)/delete/$', views.AccountDeleteView.as_view(), name='account-delete'),
    url(r'^account/(?P<slug>[\w.@+-]+)/operation/$', views.AccountOperationListView.as_view(), name='account-operation-list'),

    # Assets
    url(r'^asset/$', views.AssetRedirectView.as_view(), name='asset-redirect'),
    url(r'^trade/$', views.AssetRedirectView.as_view(), name='trade-redirect'),
    url(r'^asset/top/$', views.AssetTopListView.as_view(), name='asset-top-list'),
    # TODO: asset-list
    url(r'^asset/(?P<slug>[\w.@+-]+)/$', views.AssetDetailView.as_view(), name='asset-detail'),
    url(r'^asset/(?P<slug>[\w.@+-]+)/update/$', views.AssetUpdateView.as_view(), name='asset-update'),
    url(r'^asset/(?P<slug>[\w.@+-]+)/trust/$', views.AssetTrustListView.as_view(), name='asset-trust-list'),
    url(r'^asset/(?P<slug>[\w.@+-]+)/trusting/$', views.AssetTrustedByListView.as_view(), name='asset-trusted-by-list'),
    url(r'^asset/exchange/ticker/$', views.AssetExchangeTickerListView.as_view(), name='asset-exchange-ticker'),

    # Leaderboard
    url(r'^leaderboard/$', views.LeaderboardRedirectView.as_view(), name='leaderboard-redirect'),
    url(r'^leaderboard/top/$', views.LeaderboardListView.as_view(), name='leaderboard-list'),

    # Feed
    url(r'^feed/$', views.FeedRedirectView.as_view(), name='feed-redirect'),
    url(r'^feed/news/$', views.FeedNewsListView.as_view(), name='feed-news'),
    url(r'^feed/activity/$', views.FeedActivityListView.as_view(), name='feed-activity'),
    url(r'^feed/activity/create/$', views.FeedActivityCreateView.as_view(), name='feed-activity-create'),

    # Send
    url(r'^send/$', views.SendRedirectView.as_view(), name='send-redirect'),
    url(r'^send/payment/$', views.SendDetailView.as_view(), name='send-detail'),

    # Receive
    url(r'^receive/$', views.ReceiveRedirectView.as_view(), name='receive-redirect'),
    url(r'^receive/payment/$', views.ReceiveDetailView.as_view(), name='receive-detail'),

    # Activity
    # TODO: url(r'^activity/create/$', views.ActivityCreateView.as_view(), name='activity-create'),

    # Performance
    url(r'^performance/create/$', views.PerformanceCreateView.as_view(), name='performance-create'),
    url(r'^toml/update/$', views.AssetTomlUpdateView.as_view(), name='toml-update'),
]
