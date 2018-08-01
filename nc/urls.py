from django.conf.urls import url

from . import views

app_name = 'nc'
urlpatterns = [
    # User profile
    url(r'^profile/$', views.UserRedirectView.as_view(), name='user-redirect'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/$', views.UserDetailView.as_view(), name='user-detail'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/update/$', views.UserUpdateView.as_view(), name='user-update'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/follow/$', views.UserFollowUpdateView.as_view(), name='user-follow'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/followers/$', views.UserFollowerListView.as_view(), name='user-follower-list'),
    url(r'^profile/(?P<slug>[\w.@+-]+)/following/$', views.UserFollowingListView.as_view(), name='user-following-list'),

    # Associated Stellar account
    url(r'^account/create/$', views.AccountCreateView.as_view(), name='account-create'),
    url(r'^account/(?P<slug>[\w.@+-]+)/update/$', views.AccountUpdateView.as_view(), name='account-update'),
    url(r'^account/(?P<slug>[\w.@+-]+)/delete/$', views.AccountDeleteView.as_view(), name='account-delete'),
    url(r'^account/(?P<slug>[\w.@+-]+)/operation/$', views.AccountOperationListView.as_view(), name='account-operation-list'),

    # Assets
    url(r'^asset/$', views.AssetRedirectView.as_view(), name='asset-redirect'),
    url(r'^asset/top/$', views.AssetTopListView.as_view(), name='asset-top-list'),
    # TODO: asset-list
    url(r'^asset/(?P<slug>[\w.@+-]+)/$', views.AssetDetailView.as_view(), name='asset-detail'),
    url(r'^asset/(?P<slug>[\w.@+-]+)/update/$', views.AssetUpdateView.as_view(), name='asset-update'),
    url(r'^asset/(?P<slug>[\w.@+-]+)/trust/$', views.AssetTrustListView.as_view(), name='asset-trust-list'),

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

    # Performance
    url(r'^performance/create/$', views.PerformanceCreateView.as_view(), name='performance-create'),
]
