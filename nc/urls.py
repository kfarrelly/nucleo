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
]
