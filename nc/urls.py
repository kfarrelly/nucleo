from django.conf.urls import url

from . import views

app_name = 'nc'
urlpatterns = [
    # User profile
    url(r'^profile/$', views.UserDetailRedirectView.as_view(), name='user-redirect'),
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
    url(r'^asset/(?P<slug>[\w.@+-]+)/$', views.AssetDetailView.as_view(), name='asset-detail'),
    url(r'^asset/(?P<slug>[\w.@+-]+)/update/$', views.AssetUpdateView.as_view(), name='asset-update'),
    url(r'^asset/(?P<slug>[\w.@+-]+)/trust/$', views.AssetTrustListView.as_view(), name='asset-trust-list'),

    # Trade
    url(r'^trade/$', views.TradeRedirectView.as_view(), name='trade-redirect'),
    url(r'^trade/exchange/$', views.TradeExchangeView.as_view(), name='trade-exchange'),
    url(r'^trade/assets/top/$', views.AssetTopListView.as_view(), name='top-asset-list'),

    # Feed
    url(r'^feed/$', views.FeedRedirectView.as_view(), name='feed-redirect'),
    url(r'^feed/news/$', views.FeedNewsListView.as_view(), name='feed-news'),
    url(r'^feed/activity/$', views.FeedActivityListView.as_view(), name='feed-activity'),

    # Send
    url(r'^send/$', views.SendRedirectView.as_view(), name='send-redirect'),
    url(r'^send/payment/$', views.SendDetailView.as_view(), name='send-detail'),
]
